const { postgres } = require("../server/connect");
const { ValidationError, readText } = require("./tracking.service");

/**
 * Base de conhecimento do assistente de suporte: artigos que a equipe escreve
 * no /adm. O assistente lê todos os artigos ativos a cada resposta, por isso
 * o tamanho total é limitado.
 */

// Em caracteres. 300 mil caracteres dão por volta de 80 mil tokens.
const ARTICLE_MAX_CHARS = 80000;
const TOTAL_MAX_CHARS = 300000;

// Conteúdo é informação que o assistente consulta. Regra de conduta é ordem:
// diz o que ele pode ou não falar. Só a equipe escreve artigos, por isso a
// regra é confiável.
const KNOWLEDGE_KINDS = {
  content: "Conteúdo (informação para responder)",
  rules: "Regras de conduta (o que a IA pode ou não falar)",
};

// Quem pode receber o conteúdo do artigo nas respostas.
const KNOWLEDGE_AUDIENCES = {
  all: "Todos os clientes",
  premium: "Só clientes Premium",
};

function serializeArticle(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    kind: row.kind,
    audience: row.audience,
    active: row.active,
    chars: row.content.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readKnowledgeInput(body = {}) {
  if (!KNOWLEDGE_AUDIENCES[body.audience]) {
    throw new ValidationError("Escolha para quem o artigo vale.", "audience");
  }
  const kind = body.kind || "content";
  if (!KNOWLEDGE_KINDS[kind]) {
    throw new ValidationError("Escolha o tipo do artigo.", "kind");
  }
  return {
    kind,
    title: readText(body.title, { field: "title", label: "o título", max: 255, required: true }),
    content: readText(body.content, {
      field: "content",
      label: "o conteúdo",
      max: ARTICLE_MAX_CHARS,
      required: true,
    }),
    audience: body.audience,
    active: body.active !== false,
  };
}

/** Soma dos artigos ativos, sem contar o artigo que está sendo salvo. */
async function activeCharsExcept(articleId) {
  const result = await postgres.query(
    "SELECT COALESCE(SUM(LENGTH(content)), 0)::int AS total FROM knowledge_articles WHERE active = TRUE AND id <> $1",
    [articleId || ""],
  );
  return result.rows[0].total;
}

/** Recusa o artigo que faria a base ativa passar do limite. */
async function assertFits(input, articleId) {
  if (!input.active) return;
  const others = await activeCharsExcept(articleId);
  if (others + input.content.length > TOTAL_MAX_CHARS) {
    const free = Math.max(TOTAL_MAX_CHARS - others, 0);
    throw new ValidationError(
      `A base passaria do limite. Cabem mais ${free.toLocaleString("pt-BR")} caracteres ativos; este artigo tem ${input.content.length.toLocaleString("pt-BR")}. Resuma o texto ou desative outro artigo.`,
      "content",
    );
  }
}

/**
 * Base para o assistente, só com o que o plano atual do cliente pode receber.
 * Devolve { rules, content }: cada um é "" quando não há artigo ativo do tipo.
 */
async function getKnowledgeForSupport(memberId) {
  const result = await postgres.query(
    `
      SELECT kind, title, content FROM knowledge_articles
      WHERE active = TRUE
        AND (audience = 'all' OR audience = (SELECT plan FROM members WHERE id = $1))
      ORDER BY created_at ASC, id ASC
    `,
    [memberId],
  );
  const join = (kind) =>
    result.rows
      .filter((row) => row.kind === kind)
      .map((row) => `<artigo titulo="${row.title.replace(/"/g, "'")}">\n${row.content}\n</artigo>`)
      .join("\n\n");
  return { rules: join("rules"), content: join("content") };
}

module.exports = {
  ARTICLE_MAX_CHARS,
  TOTAL_MAX_CHARS,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_KINDS,
  serializeArticle,
  readKnowledgeInput,
  assertFits,
  getKnowledgeForSupport,
};
