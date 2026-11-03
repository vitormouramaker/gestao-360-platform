const { postgres } = require("../server/connect");
const { sendSupportQueueEmail } = require("../server/email");
const { createId } = require("../utils/ids");
const { getSettings, isSupportOpen } = require("./settings.service");

/**
 * Atendimento humano dentro do chat. O cliente pede para falar com a equipe e
 * entra na fila (waiting). Um administrador assume (active): a partir daí só
 * ele responde, e os outros não veem a conversa. Ao finalizar (closed), a IA
 * volta a responder e a conversa fica visível para todos como histórico.
 */

class TicketError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

function firstName(name) {
  return String(name || "").trim().split(" ")[0] || "Equipe Gestão 360";
}

/** Aviso do sistema dentro da conversa (não é fala de ninguém). */
async function addSystemMessage(db, memberId, ticketId, content) {
  await db.query(
    "INSERT INTO support_messages (id, member_id, role, content, ticket_id) VALUES ($1, $2, 'system', $3, $4)",
    [createId("msg"), memberId, content, ticketId],
  );
}

const TICKET_SELECT = `
  SELECT t.*, m.name AS member_name, m.email AS member_email, m.plan AS member_plan,
         a.name AS admin_name
  FROM support_tickets t
  INNER JOIN members m ON m.id = t.member_id
  LEFT JOIN members a ON a.id = t.assigned_admin_id
`;

function serializeTicket(row) {
  return {
    id: row.id,
    status: row.status,
    memberId: row.member_id,
    memberName: row.member_name,
    memberEmail: row.member_email,
    memberPlan: row.member_plan,
    adminId: row.assigned_admin_id || null,
    adminName: row.admin_name || null,
    openedAt: row.opened_at,
    claimedAt: row.claimed_at || null,
    closedAt: row.closed_at || null,
  };
}

/** Atendimento em aberto (na fila ou em andamento) do cliente, ou null. */
async function getOpenTicket(memberId) {
  const result = await postgres.query(`${TICKET_SELECT} WHERE t.member_id = $1 AND t.status <> 'closed'`, [
    memberId,
  ]);
  return result.rows[0] || null;
}

/** O que o cliente vê sobre o próprio atendimento. */
function ticketForMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    adminName: row.status === "active" ? firstName(row.admin_name) : null,
  };
}

/** O cliente pede atendimento humano pelo chat e entra na fila. */
async function openTicket(memberId) {
  const existing = await getOpenTicket(memberId);
  if (existing) return existing;

  const settings = await getSettings();
  if (!isSupportOpen(settings)) {
    throw new TicketError(`O atendimento da equipe pelo chat funciona ${settings.supportHours}.`);
  }
  const id = createId("ticket");
  try {
    await postgres.query("INSERT INTO support_tickets (id, member_id) VALUES ($1, $2)", [id, memberId]);
  } catch (error) {
    // Dois cliques ao mesmo tempo: o índice único deixa passar só um.
    if (error?.code === "23505") return getOpenTicket(memberId);
    throw error;
  }
  await addSystemMessage(
    postgres,
    memberId,
    id,
    "Você entrou na fila de atendimento. Uma pessoa do nosso time vai responder por aqui.",
  );

  const ticket = await getOpenTicket(memberId);
  notifyQueue(ticket, settings);
  return ticket;
}

/** Avisa a equipe por e-mail; falha no envio não atrapalha o atendimento. */
function notifyQueue(ticket, settings) {
  const recipients = settings.supportAlertEmail.split(",").map((email) => email.trim()).filter(Boolean);
  if (recipients.length === 0) return;
  sendSupportQueueEmail({
    to: recipients.join(", "),
    memberName: ticket.member_name,
    memberEmail: ticket.member_email,
  }).catch(() => undefined);
}

/** O cliente desiste de esperar. Só vale enquanto ninguém assumiu. */
async function cancelTicket(memberId) {
  const result = await postgres.query(
    `
      UPDATE support_tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP
      WHERE member_id = $1 AND status = 'waiting'
      RETURNING id
    `,
    [memberId],
  );
  if (result.rows.length === 0) {
    throw new TicketError("O atendimento já foi assumido por alguém da equipe.");
  }
  await addSystemMessage(
    postgres,
    memberId,
    result.rows[0].id,
    "Você saiu da fila. A assistente virtual volta a responder por aqui.",
  );
}

async function findTicket(ticketId) {
  const result = await postgres.query(`${TICKET_SELECT} WHERE t.id = $1`, [ticketId]);
  return result.rows[0] || null;
}

/** Um administrador assume o atendimento. Só o primeiro consegue. */
async function claimTicket(ticketId, admin) {
  const result = await postgres.query(
    `
      UPDATE support_tickets
      SET status = 'active', assigned_admin_id = $2, claimed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'waiting'
      RETURNING member_id
    `,
    [ticketId, admin.id],
  );
  if (result.rows.length === 0) {
    throw new TicketError("Este atendimento já foi assumido por outra pessoa ou saiu da fila.");
  }
  await addSystemMessage(
    postgres,
    result.rows[0].member_id,
    ticketId,
    `${firstName(admin.name)}, da equipe Gestão 360, entrou na conversa.`,
  );
  return findTicket(ticketId);
}

/** Atendimento em andamento que pertence a este administrador; senão, erro. */
async function requireOwnActive(ticketId, adminId) {
  const ticket = await findTicket(ticketId);
  if (!ticket) throw new TicketError("Atendimento não encontrado.", 404);
  if (ticket.status !== "active" || ticket.assigned_admin_id !== adminId) {
    throw new TicketError("Só quem assumiu o atendimento pode fazer isso.", 403);
  }
  return ticket;
}

async function addTeamMessage(ticketId, adminId, content) {
  const ticket = await requireOwnActive(ticketId, adminId);
  const result = await postgres.query(
    "INSERT INTO support_messages (id, member_id, role, content, ticket_id) VALUES ($1, $2, 'team', $3, $4) RETURNING *",
    [createId("msg"), ticket.member_id, content, ticketId],
  );
  return result.rows[0];
}

/** Devolve o atendimento para a fila, para outra pessoa assumir. */
async function releaseTicket(ticketId, adminId) {
  const ticket = await requireOwnActive(ticketId, adminId);
  await postgres.query(
    "UPDATE support_tickets SET status = 'waiting', assigned_admin_id = NULL, claimed_at = NULL WHERE id = $1",
    [ticketId],
  );
  await addSystemMessage(
    postgres,
    ticket.member_id,
    ticketId,
    "O atendimento voltou para a fila. Outra pessoa do time vai responder por aqui.",
  );
}

async function closeTicket(ticketId, adminId) {
  const ticket = await requireOwnActive(ticketId, adminId);
  await postgres.query(
    "UPDATE support_tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = $1",
    [ticketId],
  );
  await addSystemMessage(
    postgres,
    ticket.member_id,
    ticketId,
    "Atendimento encerrado. A assistente virtual volta a responder por aqui.",
  );
}

/**
 * O que cada administrador enxerga: a fila inteira, os atendimentos que ele
 * assumiu e os finalizados. Atendimento em andamento com outra pessoa não
 * aparece; só a quantidade.
 */
async function listTicketsForAdmin(adminId) {
  const [open, closed] = await Promise.all([
    postgres.query(`${TICKET_SELECT} WHERE t.status <> 'closed' ORDER BY t.opened_at ASC`),
    postgres.query(
      `${TICKET_SELECT} WHERE t.status = 'closed' AND t.assigned_admin_id IS NOT NULL ORDER BY t.closed_at DESC LIMIT 50`,
    ),
  ]);
  return {
    waiting: open.rows.filter((row) => row.status === "waiting").map(serializeTicket),
    mine: open.rows
      .filter((row) => row.status === "active" && row.assigned_admin_id === adminId)
      .map(serializeTicket),
    othersActive: open.rows.filter((row) => row.status === "active" && row.assigned_admin_id !== adminId)
      .length,
    closed: closed.rows.map(serializeTicket),
  };
}

/** Conversa de um atendimento, com as últimas mensagens de antes como contexto. */
async function readTicketForAdmin(ticketId, adminId) {
  const ticket = await findTicket(ticketId);
  if (!ticket) throw new TicketError("Atendimento não encontrado.", 404);
  if (ticket.status === "active" && ticket.assigned_admin_id !== adminId) {
    throw new TicketError("Este atendimento está com outra pessoa da equipe.", 403);
  }

  const [context, messages] = await Promise.all([
    postgres.query(
      `
        SELECT * FROM (
          SELECT * FROM support_messages
          WHERE member_id = $1 AND created_at < $2 AND role <> 'system'
          ORDER BY created_at DESC LIMIT 10
        ) recent ORDER BY created_at ASC
      `,
      [ticket.member_id, ticket.opened_at],
    ),
    postgres.query("SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC", [ticketId]),
  ]);
  return { ticket, context: context.rows, messages: messages.rows };
}

/**
 * Devolve para a fila os atendimentos em que quem assumiu deixou o cliente
 * sem resposta por mais tempo do que o configurado. Conta desde o momento em
 * que assumiu (se ainda não escreveu nada) ou desde a mensagem do cliente que
 * ficou sem resposta. Cliente quieto depois de uma resposta não conta.
 */
async function releaseIdleTickets() {
  const settings = await getSettings();
  const idle = await postgres.query(
    `
      SELECT t.id
      FROM support_tickets t
      -- Última resposta de quem está com o atendimento agora (respostas de
      -- quem atendeu antes de uma devolução à fila não contam).
      LEFT JOIN LATERAL (
        SELECT MAX(r.created_at) AS at FROM support_messages r
        WHERE r.ticket_id = t.id AND r.role = 'team' AND r.created_at >= t.claimed_at
      ) last_reply ON TRUE
      WHERE t.status = 'active'
        AND CASE
              WHEN last_reply.at IS NULL THEN t.claimed_at
              ELSE (
                SELECT MIN(u.created_at) FROM support_messages u
                WHERE u.ticket_id = t.id AND u.role = 'user' AND u.created_at > last_reply.at
              )
            END < CURRENT_TIMESTAMP - make_interval(mins => $1)
    `,
    [Number(settings.supportIdleMinutes)],
  );

  for (const row of idle.rows) {
    const released = await postgres.query(
      `
        UPDATE support_tickets SET status = 'waiting', assigned_admin_id = NULL, claimed_at = NULL
        WHERE id = $1 AND status = 'active'
        RETURNING member_id
      `,
      [row.id],
    );
    if (released.rows.length === 0) continue;

    await addSystemMessage(
      postgres,
      released.rows[0].member_id,
      row.id,
      "O atendimento voltou para a fila. Outra pessoa do time vai responder por aqui.",
    );
    notifyQueue(await findTicket(row.id), settings);
    console.log(`[atendimento] ${row.id} voltou para a fila por falta de resposta`);
  }
}

function startTicketsWorker() {
  const tick = () =>
    releaseIdleTickets().catch((error) =>
      console.error("[atendimento] falha ao conferir atendimentos parados", error?.message || error),
    );
  setInterval(tick, 60 * 1000).unref();
}

async function countWaiting() {
  const result = await postgres.query("SELECT COUNT(*)::int AS total FROM support_tickets WHERE status = 'waiting'");
  return result.rows[0].total;
}

module.exports = {
  TicketError,
  serializeTicket,
  getOpenTicket,
  ticketForMember,
  openTicket,
  cancelTicket,
  claimTicket,
  addTeamMessage,
  releaseTicket,
  closeTicket,
  listTicketsForAdmin,
  readTicketForAdmin,
  countWaiting,
  releaseIdleTickets,
  startTicketsWorker,
};
