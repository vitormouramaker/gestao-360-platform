require("../config/env");
const bcrypt = require("bcrypt");
const { postgres } = require("./connect");
const { ensureSchema } = require("../services/migrations.service");
const { sendWelcome } = require("../services/access.service");
const { isValidPlan, normalizePlan } = require("../services/plans.service");
const { createId } = require("../utils/ids");

/**
 * Cria (ou atualiza) o acesso de um cliente.
 *
 *   npm run acesso -- --email cliente@empresa.com --name "Nome" --plan premium --password "Senha@123"
 *
 * Sem --password, a pessoa recebe o e-mail de boas-vindas para criar a senha.
 * Se o e-mail já existir, atualiza nome/plano e, quando informada, a senha.
 * Com --admin a pessoa entra também no painel de administração (/adm).
 */
function readArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;

    const next = argv[index + 1];
    // Opção sem valor (ex.: --admin) vale como "sim".
    if (next === undefined || next.startsWith("--")) {
      args[argv[index].slice(2)] = true;
    } else {
      args[argv[index].slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = readArgs();
  const email = String(args.email || "").trim().toLowerCase();
  const name = String(args.name || "").trim();
  const password = typeof args.password === "string" ? args.password : null;  const isAdmin = args.admin === true || args.admin === "true";

  if (!email || !name) {
    throw new Error("Informe --email e --name.");
  }
  if (args.plan && !isValidPlan(args.plan)) {
    throw new Error("Plano inválido. Use --plan essencial ou --plan premium.");
  }
  if (password && password.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }

  const plan = normalizePlan(args.plan);
  await ensureSchema();

  const existing = await postgres.query("SELECT id FROM members WHERE email = $1", [email]);
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  if (existing.rows.length > 0) {
    await postgres.query(
      `
        UPDATE members
        SET name = $1, plan = $2, password_hash = COALESCE($3, password_hash),
            is_platform_admin = is_platform_admin OR $5, updated_at = CURRENT_TIMESTAMP
        WHERE email = $4
      `,
      [name, plan, passwordHash, email, isAdmin],
    );
    console.log(`Acesso atualizado: ${email} (${plan}).`);
    return;
  }

  const created = await postgres.query(
    `
      INSERT INTO members (id, name, email, password_hash, avatar_color, plan, is_platform_admin)
      VALUES ($1, $2, $3, $4, 'bg-emerald-600', $5, $6)
      RETURNING *
    `,
    [createId("user"), name, email, passwordHash, plan, isAdmin],
  );
  console.log(`Acesso criado: ${email} (${plan}${isAdmin ? ", administrador" : ""}).`);

  if (!passwordHash) {
    const sent = await sendWelcome(created.rows[0]);
    console.log(sent ? "E-mail para criar a senha enviado." : "FALHA ao enviar o e-mail para criar a senha.");
  }
}

main()
  .catch((error) => {
    console.error("Erro ao criar o acesso:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
