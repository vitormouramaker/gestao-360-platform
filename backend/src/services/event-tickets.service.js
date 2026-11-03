const crypto = require("crypto");
const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");
const {
  createQrPair,
  isCredenciamentoConfigured,
  processTickets,
  qrContent,
} = require("./credenciamento.service");
const { PLANS, normalizePlan, planIncludes } = require("./plans.service");

/**
 * Ingresso próprio dos eventos presenciais, com QR code. O ingresso é do
 * cliente e do evento; o código não muda. O direito de entrar não fica
 * gravado no ingresso: é conferido na hora da leitura, porque só vale para
 * quem está com a assinatura ativa na data do evento. Quem cancelou ou está
 * em atraso tem o ingresso recusado na porta, mesmo que o tenha aberto antes.
 */

class TicketAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

// Sem 0/O e 1/I, para ninguém errar ao digitar o código na entrada.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createCode() {
  const bytes = crypto.randomBytes(10);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function normalizeCode(value) {
  const clean = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/** O cliente pode entrar neste evento agora? Devolve { valid, reason }. */
function checkEntitlement(member, event) {
  if (member.is_platform_admin) {
    return { valid: false, reason: "Contas da equipe não têm ingresso." };
  }
  if (member.plan_status !== "active") {
    return { valid: false, reason: "Assinatura suspensa, cancelada ou em atraso." };
  }
  if (!planIncludes(member.plan, event.plan)) {
    return { valid: false, reason: `Evento do plano ${PLANS[normalizePlan(event.plan)].name}.` };
  }
  return { valid: true, reason: null };
}

function serializeTicket(ticket, event, member) {
  const frontend = String(process.env.FRONTEND_URL || "http://localhost:5180").replace(/\/+$/, "");
  return {
    code: ticket.code,
    // O que vai dentro do QR code. Com o credenciamento ligado, é o endereço
    // no formato que o leitor dele já lê; sem ele, a conferência do /adm.
    qrContent: qrContent(ticket, `${frontend}/adm/ingresso/${ticket.code}`),
    // true = a entrada é conferida pelo sistema de credenciamento da Gestão 360.
    credenciamento: isCredenciamentoConfigured() && Boolean(ticket.public_id),
    issuedAt: ticket.created_at,
    holderName: member.name,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location,
    },
  };
}

/** Ingresso do cliente para o evento; cria na primeira vez. */
async function getOrCreateTicket(memberId, eventId) {
  const [memberResult, eventResult] = await Promise.all([
    postgres.query("SELECT * FROM members WHERE id = $1", [memberId]),
    postgres.query("SELECT * FROM events WHERE id = $1", [eventId]),
  ]);
  const member = memberResult.rows[0];
  const event = eventResult.rows[0];
  if (!member) throw new TicketAccessError("Usuário da sessão não encontrado.", 401);
  if (!event || !event.ticketed) throw new TicketAccessError("Este evento não tem ingresso.", 404);

  const access = checkEntitlement(member, event);
  if (!access.valid) throw new TicketAccessError(access.reason);
  const pair = createQrPair();

  await postgres.query(
    `
      INSERT INTO event_tickets (id, event_id, member_id, code, public_id, token)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_id, member_id) DO UPDATE SET
        public_id = COALESCE(event_tickets.public_id, EXCLUDED.public_id),
        token = COALESCE(event_tickets.token, EXCLUDED.token),
        desired = 'active',
        sync_status = CASE
          WHEN event_tickets.desired = 'active' AND event_tickets.sync_status = 'ok' THEN 'ok'
          ELSE 'pending'
        END
    `,
    [createId("ticket"), eventId, memberId, createCode(), pair.publicId, pair.token],
  );
  // Registra o participante no credenciamento sem segurar a abertura do ingresso.
  processTickets().catch(() => undefined);
  const ticket = await postgres.query("SELECT * FROM event_tickets WHERE event_id = $1 AND member_id = $2", [
    eventId,
    memberId,
  ]);
  return serializeTicket(ticket.rows[0], event, member);
}

/** Tudo que a equipe vê ao ler um ingresso na entrada. */
async function readTicketByCode(rawCode) {
  const code = normalizeCode(rawCode);
  const result = await postgres.query(
    `
      SELECT t.id AS ticket_id, t.code, t.created_at AS ticket_created_at,
             row_to_json(e.*) AS event, row_to_json(m.*) AS member
      FROM event_tickets t
      INNER JOIN events e ON e.id = t.event_id
      INNER JOIN members m ON m.id = t.member_id
      WHERE t.code = $1
    `,
    [code],
  );
  const row = result.rows[0];
  if (!row) throw new TicketAccessError("Ingresso não encontrado. Confira o código.", 404);

  const checkins = await postgres.query(
    `
      SELECT c.checked_at, a.name AS admin_name
      FROM event_checkins c
      LEFT JOIN members a ON a.id = c.checked_by
      WHERE c.ticket_id = $1
      ORDER BY c.checked_at ASC
    `,
    [row.ticket_id],
  );
  const access = checkEntitlement(row.member, row.event);

  return {
    ticketId: row.ticket_id,
    code: row.code,
    valid: access.valid,
    reason: access.reason,
    holder: {
      id: row.member.id,
      name: row.member.name,
      email: row.member.email,
      plan: normalizePlan(row.member.plan),
    },
    event: {
      id: row.event.id,
      title: row.event.title,
      startsAt: row.event.starts_at,
      endsAt: row.event.ends_at,
      location: row.event.location,
    },
    checkins: checkins.rows.map((item) => ({ checkedAt: item.checked_at, adminName: item.admin_name })),
  };
}

/** Registra a entrada. Só passa se a assinatura estiver ativa neste momento. */
async function checkInTicket(rawCode, adminId) {
  const ticket = await readTicketByCode(rawCode);
  if (!ticket.valid) throw new TicketAccessError(`Entrada recusada: ${ticket.reason}`);

  await postgres.query("INSERT INTO event_checkins (id, ticket_id, checked_by) VALUES ($1, $2, $3)", [
    createId("checkin"),
    ticket.ticketId,
    adminId,
  ]);
  return readTicketByCode(rawCode);
}

/** Ingressos emitidos e entradas registradas de um evento. */
async function listEventTickets(eventId) {
  const result = await postgres.query(
    `
      SELECT t.code, t.created_at, m.name, m.email, m.plan, m.plan_status,
             (SELECT COUNT(*) FROM event_checkins c WHERE c.ticket_id = t.id)::int AS checkins
      FROM event_tickets t
      INNER JOIN members m ON m.id = t.member_id
      WHERE t.event_id = $1
      ORDER BY m.name ASC
    `,
    [eventId],
  );
  return result.rows.map((row) => ({
    code: row.code,
    issuedAt: row.created_at,
    name: row.name,
    email: row.email,
    plan: normalizePlan(row.plan),
    active: row.plan_status === "active",
    checkins: row.checkins,
  }));
}

module.exports = {
  TicketAccessError,
  getOrCreateTicket,
  readTicketByCode,
  checkInTicket,
  listEventTickets,
};
