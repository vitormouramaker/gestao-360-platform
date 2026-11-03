// Cria (ou atualiza) um administrador MASTER do /adm, com a senha já definida.
//
// A senha NUNCA passa por aqui em texto: o hash bcrypt é calculado fora e chega
// por ADMIN_HASH. Nome e e-mail vêm por ADMIN_NAME e ADMIN_EMAIL. Idempotente:
// rodar de novo só atualiza nome/senha e garante o papel master. Admin não
// depende de assinatura e não recebe acessos externos.
//
//   docker exec -e ADMIN_NAME="Fulana" -e ADMIN_EMAIL="x@y.com" -e ADMIN_HASH=... \
//     gestao-360-backend_container node scripts/criar-admin.js
require("../src/config/env");
const { postgres } = require("../src/server/connect");
const { ensureSchema } = require("../src/services/migrations.service");
const { createId } = require("../src/utils/ids");

const name = String(process.env.ADMIN_NAME || "").trim();
const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const hash = String(process.env.ADMIN_HASH || "").trim();

async function main() {
  if (!name) throw new Error("Informe ADMIN_NAME.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL inválido.");
  if (!/^\$2[aby]\$/.test(hash)) throw new Error("ADMIN_HASH ausente ou não é um hash bcrypt.");
  await ensureSchema();

  // Um e-mail de aluno não vira administrador por aqui (mistura os papéis).
  const existing = await postgres.query(
    "SELECT id, is_platform_admin FROM members WHERE email = $1",
    [email],
  );
  if (existing.rows[0] && existing.rows[0].is_platform_admin === false) {
    throw new Error("Este e-mail já é de um aluno. Use outro e-mail para o acesso de administrador.");
  }

  // plan 'premium' é só placeholder: admin não depende de assinatura.
  const result = await postgres.query(
    `
      INSERT INTO members (id, name, email, password_hash, avatar_color, plan, plan_status, is_platform_admin, admin_role, admin_permissions)
      VALUES ($1, $2, $3, $4, 'bg-slate-700', 'premium', 'active', TRUE, 'master', '')
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        is_platform_admin = TRUE,
        admin_role = 'master',
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted, admin_role, is_platform_admin
    `,
    [createId("user"), name, email, hash],
  );
  const r = result.rows[0];
  console.log(
    `admin ${name}: ${r.inserted ? "criado" : "atualizado"} (role ${r.admin_role}, admin=${r.is_platform_admin}) — ${email}`,
  );
  console.log("pronto. Entra com a senha definida; nenhum e-mail foi enviado.");
}

main()
  .catch((error) => {
    console.error("Erro ao criar o administrador:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
