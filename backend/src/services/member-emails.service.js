const { postgres } = require("../server/connect");
const {
  sendOnboardingBookedEmail,
  sendOnboardingLinkEmail,
  sendPlanReadyEmail,
  sendRenewalReminderEmail,
  sendTicketIssuedEmail,
  sendWelcomeGuideEmail,
} = require("../server/email");
const { sendWelcome } = require("./access.service");
const { PLANS, normalizePlan } = require("./plans.service");
const { PLATFORMS, callPlatform, isPlatformConfigured } = require("./provisioning.service");
const { nextMonthlyDate } = require("./renewal.service");

/**
 * E-mails que a plataforma manda sozinha para o cliente e que a equipe pode
 * mandar de novo pelo /adm (o e-mail não chegou, caiu no lixo, o aviso da
 * compra falhou). O envio manual manda sempre o mesmo e-mail do automático.
 */

class MemberEmailError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Guia de boas-vindas da compra: no máximo um envio automático por cliente. */
async function sendGuideOnce(member) {
  const claimed = await postgres.query(
    "UPDATE members SET guide_sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND guide_sent_at IS NULL RETURNING id",
    [member.id],
  );
  if (claimed.rowCount === 0) return null;

  const sent = await sendGuide(member);
  if (!sent) {
    await postgres.query("UPDATE members SET guide_sent_at = NULL WHERE id = $1", [member.id]);
  }
  return sent;
}

async function sendGuide(member, { manual = false } = {}) {
  const sent = await sendWelcomeGuideEmail({
    to: member.email,
    name: member.name,
    planName: PLANS[normalizePlan(member.plan)].name,
    track: { memberId: member.id, kind: "guide", manual },
  });
  if (sent) {
    await postgres.query("UPDATE members SET guide_sent_at = CURRENT_TIMESTAMP WHERE id = $1", [member.id]);
  }
  return sent;
}

/** Versão que nunca lança: a compra não pode falhar por causa do guia. */
function sendGuideOnceSafely(member) {
  return sendGuideOnce(member).catch((error) => {
    console.error("[e-mails] falha ao enviar o guia de boas-vindas", member.id, error?.message || error);
    return false;
  });
}

async function loadContext(memberId) {
  const memberResult = await postgres.query(
    "SELECT * FROM members WHERE id = $1 AND is_platform_admin = FALSE",
    [memberId],
  );
  const member = memberResult.rows[0];
  if (!member) throw new MemberEmailError("Aluno não encontrado.", 404);

  const [tickets, call, entitlement, accounts, plan] = await Promise.all([
    postgres.query(
      `
        SELECT t.id, t.code, t.notified_at, e.title, e.starts_at, e.ends_at, e.location
        FROM event_tickets t
        INNER JOIN events e ON e.id = t.event_id
        WHERE t.member_id = $1 AND t.desired = 'active' AND e.ticketed = TRUE
          AND COALESCE(e.ends_at, e.starts_at + INTERVAL '1 day') >= CURRENT_TIMESTAMP
        ORDER BY e.starts_at ASC
      `,
      [memberId],
    ),
    postgres.query(
      "SELECT * FROM onboarding_calls WHERE member_id = $1 AND status = 'scheduled' ORDER BY starts_at DESC LIMIT 1",
      [memberId],
    ),
    postgres.query(
      `
        SELECT renews_at FROM member_entitlements
        WHERE member_id = $1 AND active = TRUE AND renews_at > CURRENT_TIMESTAMP
        ORDER BY renews_at ASC LIMIT 1
      `,
      [memberId],
    ),
    postgres.query("SELECT platform, remote_status FROM external_accounts WHERE member_id = $1", [memberId]),
    postgres.query(
      "SELECT cycle FROM plans WHERE member_id = $1 AND status = 'approved' ORDER BY cycle DESC LIMIT 1",
      [memberId],
    ),
  ]);

  const renewsAt =
    entitlement.rows[0]?.renews_at || (member.purchase_date ? nextMonthlyDate(member.purchase_date) : null);

  return {
    member,
    tickets: tickets.rows,
    call: call.rows[0] || null,
    renewsAt,
    // O último ciclo liberado (aprovado): base do e-mail "plano pronto".
    approvedPlan: plan.rows[0] || null,
    // Plataformas em que o 360 chegou a pedir uma conta para este cliente.
    accounts: Object.fromEntries(accounts.rows.map((row) => [row.platform, row.remote_status])),
  };
}

// O que cada plataforma responde ao pedido de reenvio, quando não reenvia.
const PLATFORM_REFUSALS = {
  nao_encontrado: "A plataforma não tem conta com este e-mail. Use \"Tentar de novo\" em Acessos nas outras plataformas.",
  nao_gerenciado: "A conta já existia antes do 360: a plataforma não reenvia o acesso por aqui.",
  cadastro_concluido: "O cliente já finalizou o cadastro lá. Para trocar a senha, ele usa \"esqueci minha senha\" na própria plataforma.",
  falha_email: "A plataforma não conseguiu enviar o e-mail. Tente novamente em instantes.",
};

/** Pede à plataforma que mande de novo o e-mail de acesso que ela envia na criação da conta. */
async function resendPlatformAccess(platformId, member) {
  let data;
  try {
    data = await callPlatform(platformId, "reenviar-acesso", { email: member.email });
  } catch (error) {
    // Plataforma fora do ar, ou ainda sem a rota de reenvio publicada.
    throw new MemberEmailError(
      `${PLATFORMS[platformId].label} não atendeu o pedido: ${error?.name === "AbortError" ? "não respondeu a tempo" : error?.message || error}`,
      502,
    );
  }
  if (data.status === "reenviado") return true;
  throw new MemberEmailError(
    PLATFORM_REFUSALS[data.status] || `A plataforma respondeu "${data.status}".`,
    data.status === "falha_email" ? 502 : 409,
  );
}

/** Lista dos e-mails que podem ser mandados agora para o cliente. */
function buildCatalog({ member, tickets, call, renewsAt, accounts, approvedPlan }) {
  const suspended = member.plan_status !== "active";
  const blocked = suspended ? "A assinatura está suspensa." : null;

  const items = [
    {
      key: "access",
      label: member.password_hash ? "Acesso: link para criar uma nova senha" : "Acesso liberado: criar a senha",
      description: "O e-mail com o botão para criar a senha da plataforma. O link vale por 7 dias.",
      lastSentAt: member.welcome_sent_at,
      available: true,
      reason: null,
      send: () => sendWelcome(member, { manual: true }),
    },
    {
      key: "guide",
      label: "Boas-vindas e primeiros passos",
      description: "O guia geral: como entrar no 360 e como ativar o acesso às outras plataformas.",
      lastSentAt: member.guide_sent_at,
      available: true,
      reason: null,
      send: () => sendGuide(member, { manual: true }),
    },
    // E-mail de acesso de cada plataforma: quem envia é a própria plataforma.
    ...Object.entries(PLATFORMS).map(([platformId, platform]) => {
      const configured = isPlatformConfigured(platformId);
      const requested = Object.prototype.hasOwnProperty.call(accounts, platformId);
      return {
        key: `platform:${platformId}`,
        label: `Acesso: ${platform.label}`,
        description:
          platformId === "crm"
            ? "O e-mail do CRM com o link para finalizar o cadastro e criar a senha."
            : `O e-mail da ${platform.label} com o login e uma nova senha provisória.`,
        lastSentAt: null,
        available: configured && requested,
        reason: !configured
          ? "A integração com esta plataforma está desligada."
          : requested
            ? null
            : "O 360 ainda não pediu a conta deste cliente nesta plataforma.",
        send: () => resendPlatformAccess(platformId, member),
      };
    }),
    ...tickets.map((ticket) => ({
      key: `ticket:${ticket.id}`,
      label: `Ingresso: ${ticket.title}`,
      description: "O aviso de que o ingresso do evento foi gerado e está na plataforma.",
      lastSentAt: ticket.notified_at,
      available: !suspended,
      reason: blocked,
      send: async () => {
        const sent = await sendTicketIssuedEmail({
          to: member.email,
          name: member.name,
          eventTitle: ticket.title,
          startsAt: ticket.starts_at,
          endsAt: ticket.ends_at,
          location: ticket.location,
          code: ticket.code,
          track: { memberId: member.id, kind: "ticket", manual: true },
        });
        if (sent) {
          await postgres.query("UPDATE event_tickets SET notified_at = CURRENT_TIMESTAMP WHERE id = $1", [ticket.id]);
        }
        return sent;
      },
    })),
  ];

  if (call) {
    items.push({
      key: "onboarding_booked",
      label: "Integração do CRM: agendamento confirmado",
      description: "A confirmação do dia e do horário da chamada de integração.",
      lastSentAt: null,
      available: true,
      reason: null,
      send: () =>
        sendOnboardingBookedEmail({
          to: member.email,
          name: member.name,
          startsAt: call.starts_at,
          track: { memberId: member.id, kind: "onboarding_booked", manual: true },
        }),
    });
    items.push({
      key: "onboarding_link",
      label: "Integração do CRM: link da chamada",
      description: "O e-mail com o link da chamada de vídeo.",
      lastSentAt: null,
      available: Boolean(call.meet_link),
      reason: call.meet_link ? null : "O link da chamada ainda não foi cadastrado.",
      send: () =>
        sendOnboardingLinkEmail({
          to: member.email,
          name: member.name,
          startsAt: call.starts_at,
          meetLink: call.meet_link,
          track: { memberId: member.id, kind: "onboarding_link", manual: true },
        }),
    });
  }

  items.push({
    key: "plan_ready",
    label: "Plano de ação liberado",
    description: "O aviso de que o Diagnóstico 360° e o plano de ação já estão na plataforma.",
    lastSentAt: null,
    available: Boolean(approvedPlan),
    reason: approvedPlan ? null : "Este cliente ainda não tem um plano liberado.",
    send: () =>
      sendPlanReadyEmail({
        to: member.email,
        name: member.name,
        firstCycle: Number(approvedPlan?.cycle) === 1,
        track: { memberId: member.id, kind: "plan_ready", manual: true },
      }),
  });

  items.push({
    key: "renewal",
    label: "Lembrete de renovação",
    description: "O aviso de que a assinatura renova nos próximos dias.",
    lastSentAt: null,
    available: Boolean(renewsAt) && !suspended,
    reason: blocked || (renewsAt ? null : "Não há data de renovação para este cliente."),
    send: () =>
      sendRenewalReminderEmail({
        to: member.email,
        name: member.name,
        planName: PLANS[normalizePlan(member.plan)].name,
        renewsAt,
        track: { memberId: member.id, kind: "renewal", manual: true },
      }),
  });

  return items;
}

async function listMemberEmails(memberId) {
  const context = await loadContext(memberId);
  return buildCatalog(context).map(({ send, ...item }) => item);
}

/** Manda agora um dos e-mails da lista. Devolve a mensagem para a equipe. */
async function sendMemberEmail(memberId, key) {
  const context = await loadContext(memberId);
  const item = buildCatalog(context).find((entry) => entry.key === String(key || ""));
  if (!item) throw new MemberEmailError("E-mail não encontrado para este aluno.", 404);
  if (!item.available) throw new MemberEmailError(item.reason || "Este e-mail não pode ser enviado agora.");

  const sent = await item.send();
  if (!sent) throw new MemberEmailError("O e-mail não saiu. Tente novamente em instantes.", 502);
  return `"${item.label}" enviado para ${context.member.email}.`;
}

module.exports = {
  MemberEmailError,
  listMemberEmails,
  sendMemberEmail,
  sendGuideOnce,
  sendGuideOnceSafely,
};
