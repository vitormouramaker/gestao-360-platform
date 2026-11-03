// Carrega na base de conhecimento os artigos iniciais de src/agent/base-inicial.
// Cada arquivo começa com "titulo:", "tipo:" (content ou rules) e "publico:"
// (all ou premium), uma linha "---" e depois o texto.
//
//   node scripts/carregar-base.js              cria os que ainda não existem
//   node scripts/carregar-base.js --atualizar  também regrava os que já existem
//   node scripts/carregar-base.js --forcar     regrava todos, inclusive os editados no /adm
//
// O artigo é reconhecido pelo título. Sem --forcar, artigo que a equipe editou
// pelo /adm nunca é regravado: quem o criou ou atualizou por aqui deixa updated_at igual
// a created_at, e qualquer edição pelo /adm desfaz essa igualdade.
require("../src/config/env");
const fs = require("fs");
const path = require("path");
const { postgres } = require("../src/server/connect");
const {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_KINDS,
  ARTICLE_MAX_CHARS,
} = require("../src/services/knowledge.service");
const { ensureSchema } = require("../src/services/migrations.service");
const { createId } = require("../src/utils/ids");

const DIR = path.join(__dirname, "..", "src", "agent", "base-inicial");

function readArticle(file) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r/g, "");
  const cut = raw.indexOf("\n---\n");
  if (cut < 0) throw new Error(`${file}: falta a linha --- depois do cabeçalho`);

  const header = Object.fromEntries(
    raw
      .slice(0, cut)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
  const article = {
    title: header.titulo,
    kind: header.tipo,
    audience: header.publico,
    content: raw.slice(cut + 5).trim(),
  };

  if (!article.title) throw new Error(`${file}: falta o titulo`);
  if (!KNOWLEDGE_KINDS[article.kind]) throw new Error(`${file}: tipo inválido`);
  if (!KNOWLEDGE_AUDIENCES[article.audience]) throw new Error(`${file}: publico inválido`);
  if (!article.content) throw new Error(`${file}: sem texto`);
  if (article.content.length > ARTICLE_MAX_CHARS) throw new Error(`${file}: passa do limite por artigo`);
  return article;
}

async function main() {
  const force = process.argv.includes("--forcar");
  const update = force || process.argv.includes("--atualizar");
  await ensureSchema();

  const files = fs.readdirSync(DIR).filter((file) => file.endsWith(".md")).sort();
  for (const file of files) {
    const article = readArticle(file);
    const found = await postgres.query(
      "SELECT id, content, (updated_at <> created_at) AS edited FROM knowledge_articles WHERE title = $1",
      [article.title],
    );

    if (found.rows.length === 0) {
      await postgres.query(
        "INSERT INTO knowledge_articles (id, kind, title, content, audience, active) VALUES ($1, $2, $3, $4, $5, TRUE)",
        [createId("kb"), article.kind, article.title, article.content, article.audience],
      );
      console.log(`criado:     ${article.title} (${article.content.length} caracteres)`);
    } else if (update && found.rows[0].edited && !force) {
      console.log(`mantido:    ${article.title} (editado pela equipe no /adm)`);
    } else if (update && found.rows[0].content === article.content) {
      console.log(`igual:      ${article.title}`);
    } else if (update) {
      await postgres.query(
        "UPDATE knowledge_articles SET kind = $1, content = $2, audience = $3, updated_at = created_at WHERE id = $4",
        [article.kind, article.content, article.audience, found.rows[0].id],
      );
      console.log(`atualizado: ${article.title} (${article.content.length} caracteres)`);
    } else {
      console.log(`mantido:    ${article.title} (já existe)`);
    }
  }

  const total = await postgres.query(
    "SELECT COUNT(*)::int AS artigos, COALESCE(SUM(LENGTH(content)), 0)::int AS caracteres FROM knowledge_articles WHERE active = TRUE",
  );
  console.log(`base ativa: ${total.rows[0].artigos} artigos, ${total.rows[0].caracteres} caracteres`);
}

main()
  .catch((error) => {
    console.error("falhou:", error.message);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
