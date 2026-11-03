const jwt = require("jsonwebtoken");
const { postgres } = require("../server/connect");
const { sendWelcomeEmail } = require("../server/email");
const { JWT_SECRET } = require("../config/jwt");
const { createId } = require("../utils/ids");
const { createAccessLink } = require("./access-links.service");
const { PLANS, normalizePlan, planIncludes } = require("./plans.service");
const { crmEnabledForNew } = require("./settings.service");

/**
 * Entrada e saída de clientes: criar o acesso (compra na Hubla ou cadastro pela
 * equipe), mandar o e-mail para criar a senha e suspender quando a assinatura cai.
 */

// Validade do link de "criar senha" do e-mail de boas-vindas.
const SETUP_TOKEN_EXPIRES_IN = "7d";

// O segredo do token inclui o hash atual da senha: depois que a senha é criada
// ou trocada, qualquer link emitido antes deixa de funcionar.
function getResetTokenSecret(passwordHash) {
  return `${JWT_SECRET}.${passwordHash || ""}`;
}

function createSetupToken(member) {
  return jwt.sign(
    { id: member.id, reset: true, setup: true },
    getResetTokenSecret(member.password_hash),
    { expiresIn: SETUP_TOKEN_EXPIRES_IN },
  );
}

/** E-mail de boas-vindas com o link para criar a senha. Devolve se foi enviado. */
async function sendWelcome(member, { manual = false } = {}) {
  const plan = normalizePlan(member.plan);
  const sent = await sendWelcomeEmail({
    to: member.email,
    name: member.name,
    planName: PLANS[plan].name,
    url: await createAccessLink(member),
    track: { memberId: member.id, kind: "access", manual },
  });

  if (sent) {
    await postgres.query("UPDATE members SET welcome_sent_at = CURRENT_TIMESTAMP WHERE id = $1", [
      member.id,
    ]);
  }
  return sent;
}

/**
 * Boas-vindas automática da compra: no máximo uma por cliente. A Hubla manda
 * vários avisos da mesma compra no mesmo segundo; só o primeiro que marcar o
 * envio no banco manda o e-mail. Devolve true (enviado), false (falhou) ou
 * null (outro aviso já cuidou disso).
 */
async function sendWelcomeOnce(member) {
  const claimed = await postgres.query(
    "UPDATE members SET welcome_sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND welcome_sent_at IS NULL RETURNING id",
    [member.id],
  );
  if (claimed.rowCount === 0) return null;

  const sent = await sendWelcome(member);
  if (!sent) {
    // Falhou: libera para o próximo aviso (ou a equipe) tentar de novo.
    await postgres.query("UPDATE members SET welcome_sent_at = NULL WHERE id = $1", [member.id]);
  }
  return sent;
}

/**
 * Registra o que a Hubla avisou sobre uma assinatura (ativa ou encerrada) e
 * recalcula o acesso do cliente a partir de TODAS as assinaturas dele.
 *
 * É por assinatura, e não um simples liga/desliga, por causa do upgrade: quem
 * tem o Essencial e compra o Premium fica com duas assinaturas. Quando a do
 * Essencial for encerrada, o cliente continua Premium. E se a do Premium cair
 * com a do Essencial ainda ativa, ele volta para o Essencial.
 *
 * renewsAt é a próxima renovação calculada a partir do aviso. Com
 * renewsAtProvisional, só vale se a assinatura ainda não tiver data (avisos de
 * ativação não dizem quando foi o último pagamento).
 *
 * Devolve { member, created, suspended } ou null quando o aviso é de
 * encerramento e não existe cadastro com aquele e-mail.
 */
async function applyEntitlement({ email, name, plan, active, renewsAt = null, renewsAtProvisional = false }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existing = await postgres.query("SELECT * FROM members WHERE email = $1", [normalizedEmail]);
  let member = existing.rows[0] || null;
  let created = false;

  if (!member) {
    if (!active) return null;
    // Dois avisos da mesma compra podem chegar juntos: quem perder a corrida
    // pelo cadastro usa o que o outro acabou de criar.
    const inserted = await postgres.query(
      `
        INSERT INTO members (id, name, email, avatar_color, plan, plan_status, crm_enabled)
        VALUES ($1, $2, $3, 'bg-emerald-600', $4, 'active', $5)
        ON CONFLICT (email) DO NOTHING
        RETURNING *
      `,
      [
        createId("user"),
        String(name || "").trim() || normalizedEmail,
        normalizedEmail,
        normalizePlan(plan),
        await crmEnabledForNew(),
      ],
    );
    if (inserted.rows[0]) {
      member = inserted.rows[0];
      created = true;
    } else {
      const again = await postgres.query("SELECT * FROM members WHERE email = $1", [normalizedEmail]);
      member = again.rows[0];
    }
  }

  // A equipe da Gestão 360 não depende de assinatura: aviso nenhum mexe no acesso dela.
  if (member.is_platform_admin) {
    return { member, created, suspended: false };
  }

  if (active) {
    await postgres.query(
      `
        INSERT INTO member_entitlements (member_id, plan, active, renews_at)
        VALUES ($1, $2, TRUE, $3)
        ON CONFLICT (member_id, plan) DO UPDATE SET
          active = TRUE,
          renews_at = CASE
            WHEN $3::timestamptz IS NULL THEN member_entitlements.renews_at
            WHEN $4::boolean THEN COALESCE(member_entitlements.renews_at, $3::timestamptz)
            ELSE $3::timestamptz
          END,
          updated_at = CURRENT_TIMESTAMP
      `,
      [member.id, normalizePlan(plan), renewsAt, renewsAtProvisional],
    );
  } else if (plan) {
    await postgres.query(
      `
        INSERT INTO member_entitlements (member_id, plan, active)
        VALUES ($1, $2, FALSE)
        ON CONFLICT (member_id, plan) DO UPDATE SET active = FALSE, updated_at = CURRENT_TIMESTAMP
      `,
      [member.id, normalizePlan(plan)],
    );
  } else {
    // Encerramento sem oferta reconhecida: vale para tudo que o cliente tem.
    await postgres.query(
      "UPDATE member_entitlements SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE member_id = $1",
      [member.id],
    );
  }

  const entitlements = await postgres.query(
    "SELECT plan FROM member_entitlements WHERE member_id = $1 AND active = TRUE",
    [member.id],
  );
  const activePlans = entitlements.rows.map((row) => normalizePlan(row.plan));

  if (activePlans.length === 0) {
    const suspended = await postgres.query(
      "UPDATE members SET plan_status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [member.id],
    );
    // Quem estava logado deixa de conseguir renovar a sessão.
    const { revokeAllSessions } = require("./session.service");
    await revokeAllSessions(member.id);
    return { member: suspended.rows[0], created, suspended: true };
  }

  const best = activePlans.some((item) => planIncludes(item, "premium")) ? "premium" : "essencial";
  const updated = await postgres.query(
    `
      UPDATE members SET plan = $1, plan_status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `,
    [best, member.id],
  );
  return { member: updated.rows[0], created, suspended: false };
}

function isAccessActive(member) {
  return Boolean(member.is_platform_admin) || member.plan_status === "active";
}

module.exports = {
  getResetTokenSecret,
  createSetupToken,
  sendWelcome,
  sendWelcomeOnce,
  applyEntitlement,
  isAccessActive,
};
