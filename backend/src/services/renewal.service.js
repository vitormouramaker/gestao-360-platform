const { postgres } = require("../server/connect");
const { sendRenewalReminderEmail } = require("../server/email");
const { PLANS, normalizePlan } = require("./plans.service");

/**
 * Lembrete de renovação. O corte do acesso é na hora em que a Hubla avisa que
 * a assinatura caiu; para o cliente não ser pego de surpresa, 3 dias antes da
 * data de renovação ele recebe um e-mail e passa a ver um aviso na plataforma.
 *
 * A data de renovação é calculada a partir dos avisos da Hubla (ver
 * hubla.service). Para quem foi cadastrado à mão vale a data de compra
 * informada no cadastro: a renovação cai no mesmo dia de cada mês.
 */

const REMINDER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Próxima renovação de quem foi cadastrado à mão: o mesmo dia do mês da
 * compra, no próximo mês em que ele ainda não passou. Compra no dia 31 renova
 * no último dia dos meses mais curtos.
 */
function nextMonthlyDate(purchaseDate, now = new Date()) {
  const start = new Date(purchaseDate);
  const day = start.getUTCDate();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (let offset = 0; offset <= 1; offset += 1) {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + offset;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const candidate = new Date(Date.UTC(year, month, Math.min(day, lastDay)));
    // No próprio mês da compra ainda não há renovação.
    if (candidate >= today && candidate > start) return candidate;
  }
  return null;
}
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Próxima renovação do cliente, se cair nos próximos dias; senão null. */
async function getRenewalNotice(memberId) {
  const result = await postgres.query(
    `
      SELECT MIN(e.renews_at) AS renews_at
      FROM member_entitlements e
      INNER JOIN members m ON m.id = e.member_id
      WHERE e.member_id = $1 AND e.active = TRUE AND m.is_platform_admin = FALSE
        AND e.renews_at > CURRENT_TIMESTAMP
        AND e.renews_at <= CURRENT_TIMESTAMP + make_interval(days => $2)
    `,
    [memberId, REMINDER_DAYS],
  );
  const renewsAt = result.rows[0]?.renews_at;
  if (renewsAt) return { renewsAt };

  // Sem data vinda da Hubla, vale a data de compra informada no cadastro.
  const manual = await postgres.query(
    `
      SELECT m.purchase_date FROM members m
      WHERE m.id = $1 AND m.is_platform_admin = FALSE AND m.purchase_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM member_entitlements e
          WHERE e.member_id = m.id AND e.active = TRUE AND e.renews_at IS NOT NULL
        )
    `,
    [memberId],
  );
  const next = manual.rows[0] ? nextMonthlyDate(manual.rows[0].purchase_date) : null;
  return next && next.getTime() - Date.now() <= REMINDER_DAYS * DAY_MS ? { renewsAt: next } : null;
}

/** Manda o e-mail de lembrete para quem renova nos próximos dias, uma vez por data. */
async function sendRenewalReminders() {
  const due = await postgres.query(
    `
      SELECT e.member_id, e.plan, e.renews_at, m.name, m.email
      FROM member_entitlements e
      INNER JOIN members m ON m.id = e.member_id
      WHERE e.active = TRUE AND m.is_platform_admin = FALSE AND m.plan_status = 'active'
        AND e.renews_at > CURRENT_TIMESTAMP
        AND e.renews_at <= CURRENT_TIMESTAMP + make_interval(days => $1)
        AND e.renewal_reminded_for IS DISTINCT FROM e.renews_at
    `,
    [REMINDER_DAYS],
  );

  for (const row of due.rows) {
    // Marca antes de enviar: se o servidor reiniciar no meio, o cliente não
    // recebe o mesmo lembrete duas vezes.
    const claimed = await postgres.query(
      `
        UPDATE member_entitlements SET renewal_reminded_for = renews_at
        WHERE member_id = $1 AND plan = $2 AND renews_at = $3
          AND renewal_reminded_for IS DISTINCT FROM renews_at
        RETURNING member_id
      `,
      [row.member_id, row.plan, row.renews_at],
    );
    if (claimed.rows.length === 0) continue;

    const sent = await sendRenewalReminderEmail({
      to: row.email,
      track: { memberId: row.member_id || row.id, kind: "renewal" },
      name: row.name,
      planName: PLANS[normalizePlan(row.plan)].name,
      renewsAt: row.renews_at,
    });
    console.log(`[renovação] lembrete para ${row.member_id}: ${sent ? "enviado" : "FALHOU"}`);
  }

  // Cadastrados à mão, pela data de compra.
  const manual = await postgres.query(`
    SELECT m.id, m.name, m.email, m.plan, m.purchase_date, m.manual_reminded_for
    FROM members m
    WHERE m.is_platform_admin = FALSE AND m.plan_status = 'active' AND m.purchase_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM member_entitlements e
        WHERE e.member_id = m.id AND e.active = TRUE AND e.renews_at IS NOT NULL
      )
  `);
  for (const row of manual.rows) {
    const next = nextMonthlyDate(row.purchase_date);
    if (!next || next.getTime() - Date.now() > REMINDER_DAYS * DAY_MS) continue;
    const key = next.toISOString().slice(0, 10);

    const claimed = await postgres.query(
      `
        UPDATE members SET manual_reminded_for = $2::date
        WHERE id = $1 AND manual_reminded_for IS DISTINCT FROM $2::date
        RETURNING id
      `,
      [row.id, key],
    );
    if (claimed.rows.length === 0) continue;

    const sent = await sendRenewalReminderEmail({
      to: row.email,
      track: { memberId: row.member_id || row.id, kind: "renewal" },
      name: row.name,
      planName: PLANS[normalizePlan(row.plan)].name,
      renewsAt: next,
    });
    console.log(`[renovação] lembrete (cadastro manual) para ${row.id}: ${sent ? "enviado" : "FALHOU"}`);
  }
}

function startRenewalWorker() {
  const tick = () =>
    sendRenewalReminders().catch((error) =>
      console.error("[renovação] falha ao enviar lembretes", error?.message || error),
    );
  tick();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}

module.exports = {
  REMINDER_DAYS,
  nextMonthlyDate,
  getRenewalNotice,
  sendRenewalReminders,
  startRenewalWorker,
};
