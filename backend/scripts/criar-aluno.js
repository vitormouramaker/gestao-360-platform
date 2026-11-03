// Cria (ou atualiza) o acesso de um ALUNO, com a senha já definida.
//
// A senha NUNCA passa por aqui em texto: o hash bcrypt é calculado fora e chega
// por ALUNO_HASH. Nome e e-mail vêm por ALUNO_NAME e ALUNO_EMAIL. O plano vem em
// ALUNO_PLAN (essencial|premium); vazio = premium (Assinatura Anual, o plano
// vendido). O CRM segue o padrão global dos novos clientes (hoje: desligado).
// Idempotente. Não dispara provisionamento externo (Academy/Formação Executiva): se precisar,
// use "pedir acessos" no /adm.
//
//   docker exec -e ALUNO_NAME="Fulana" -e ALUNO_EMAIL="x@y.com" -e ALUNO_HASH=... \
//     [-e ALUNO_PLAN=premium] gestao-360-backend_container node scripts/criar-aluno.js
require("../src/config/env");
const { postgres } = require("../src/server/connect");
const { ensureSchema } = require("../src/services/migrations.service");
const { isValidPlan, normalizePlan } = require("../src/services/plans.service");
const { crmEnabledForNew } = require("../src/services/settings.service");
const { createId } = require("../src/utils/ids");

const name = String(process.env.ALUNO_NAME || "").trim();
const email = String(process.env.ALUNO_EMAIL || "").trim().toLowerCase();
const hash = String(process.env.ALUNO_HASH || "").trim();
const planInput = String(process.env.ALUNO_PLAN || "premium").trim();

async function main() {
  if (!name) throw new Error("Informe ALUNO_NAME.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ALUNO_EMAIL inválido.");
  if (!/^\$2[aby]\$/.test(hash)) throw new Error("ALUNO_HASH ausente ou não é um hash bcrypt.");
  if (planInput && !isValidPlan(planInput)) throw new Error("ALUNO_PLAN inválido (use essencial ou premium).");
  await ensureSchema();

  const existing = await postgres.query(
    "SELECT id, is_platform_admin FROM members WHERE email = $1",
    [email],
  );
  if (existing.rows[0] && existing.rows[0].is_platform_admin === true) {
    throw new Error("Este e-mail já é de um administrador. Use outro e-mail para o acesso de aluno.");
  }

  const plan = normalizePlan(planInput);
  const crm = await crmEnabledForNew();

  const result = await postgres.query(
    `
      INSERT INTO members (id, name, email, password_hash, avatar_color, plan, plan_status, crm_enabled)
      VALUES ($1, $2, $3, $4, 'bg-emerald-600', $5, 'active', $6)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        plan = EXCLUDED.plan,
        plan_status = 'active',
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted, plan, crm_enabled
    `,
    [createId("user"), name, email, hash, plan, crm],
  );
  const r = result.rows[0];
  console.log(
    `aluno ${name}: ${r.inserted ? "criado" : "atualizado"} (plano ${r.plan}, CRM ${r.crm_enabled ? "ligado" : "desligado"}) — ${email}`,
  );
  console.log("pronto. Entra com a senha definida; nenhum e-mail foi enviado.");
}

main()
  .catch((error) => {
    console.error("Erro ao criar o aluno:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
