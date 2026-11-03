/**
 * Contas fictícias para rodar a plataforma localmente: um aluno de cada plano
 * e um administrador master. Pode rodar de novo: quem já existe só tem a senha
 * redefinida.
 *
 *   npm run seed:demo                     senha padrão Demo@360
 *   CONTAS_SENHA="OutraSenha@1" npm run seed:demo
 *
 * Trava de segurança: não roda com NODE_ENV=production.
 */
require("../src/config/env");
const bcrypt = require("bcrypt");
const { postgres } = require("../src/server/connect");
const { ensureSchema } = require("../src/services/migrations.service");
const { createId } = require("../src/utils/ids");

const DOMINIO = "demo.gestao360.test";
const CONTAS = [
  { email: `essencial@${DOMINIO}`, name: "Cliente Essencial", plan: "essencial", admin: false },
  { email: `premium@${DOMINIO}`, name: "Cliente Premium", plan: "premium", admin: false },
  { email: `admin@${DOMINIO}`, name: "Equipe Gestão 360", plan: "premium", admin: true },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Este roteiro cria contas com senha conhecida e não roda em produção.");
  }

  const senha = String(process.env.CONTAS_SENHA || "").trim() || "Demo@360";
  const hash = await bcrypt.hash(senha, 10);
  await ensureSchema();

  for (const conta of CONTAS) {
    await postgres.query(
      `
        INSERT INTO members (id, name, email, password_hash, avatar_color, plan, is_platform_admin, admin_role)
        VALUES ($1, $2, $3, $4, 'bg-emerald-600', $5, $6, $7)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          plan = EXCLUDED.plan,
          plan_status = 'active',
          is_platform_admin = EXCLUDED.is_platform_admin,
          admin_role = EXCLUDED.admin_role
      `,
      [createId("user"), conta.name, conta.email, hash, conta.plan, conta.admin, conta.admin ? "master" : null],
    );
    console.log(`conta pronta: ${conta.email} (${conta.plan}${conta.admin ? ", administrador" : ""})`);
  }

  console.log(`senha das contas: ${senha}`);
}

main()
  .catch((error) => {
    console.error("Erro ao criar as contas de teste:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
