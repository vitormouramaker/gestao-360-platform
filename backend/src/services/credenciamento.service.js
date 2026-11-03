const crypto = require("crypto");
const { postgres } = require("../server/connect");
const { sendTicketIssuedEmail } = require("../server/email");
const { createId } = require("../utils/ids");
const { planIncludes } = require("./plans.service");

/**
 * Ligação dos ingressos do 360 com o sistema de credenciamento da Gestão 360, que é
 * quem lê o QR code na porta do evento.
 *
 * O QR do credenciamento é o endereço {site}/qrcode/{publicId}?t={token}. O
 * 360 gera esse par para cada ingresso, registra o participante lá com o
 * mesmo par e mostra ao cliente exatamente esse endereço em QR code: o leitor
 * que a equipe já usa lê o ingresso do 360 sem nenhuma mudança.
 *
 * O direito de entrar acompanha a assinatura: quando ela cai, o 360 avisa o
 * credenciamento para bloquear o participante; quando volta, reativa.
 * Sem endereço e chave configurados, nada é enviado e o ingresso do 360
 * continua valendo só pela conferência do próprio /adm.
 */

const REQUEST_TIMEOUT_MS = 20000;
const WORKER_INTERVAL_MS = 60 * 1000;

function config() {
  const url = String(process.env.CREDENCIAMENTO_INTEGRATION_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.CREDENCIAMENTO_INTEGRATION_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function isCredenciamentoConfigured() {
  return Boolean(config());
}

/** Endereço do site do credenciamento, que vai dentro do QR code. */
function qrBase() {
  return String(process.env.CREDENCIAMENTO_QR_BASE || "https://credenciamento.example.com")
    .trim()
    .replace(/\/+$/, "");
}

/** Par que identifica o ingresso no credenciamento, no formato que ele usa. */
function createQrPair() {
  return {
    publicId: crypto.randomBytes(18).toString("base64url"),
    token: crypto.randomBytes(32).toString("base64url"),
  };
}

/** O que vai dentro do QR code deste ingresso. */
function qrContent(ticket, fallbackUrl) {
  // Sem o credenciamento ligado, o leitor de lá não conheceria este ingresso.
  return config() && ticket.public_id && ticket.token
    ? `${qrBase()}/qrcode/${ticket.public_id}?t=${ticket.token}`
    : fallbackUrl;
}

async function call(method, path, body) {
  const settings = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.url}/api/integracao/gestao360/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-integration-key": settings.key },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.mensagem || `O credenciamento respondeu ${response.status}.`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Identificador curto e estável do evento no credenciamento. */
function eventKey(event) {
  const slug = String(event.title || "evento")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // O final do id do 360 evita choque entre dois eventos de mesmo nome.
  return `${slug || "evento"}-${String(event.id).replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase()}`;
}

/** Cria ou atualiza o evento no credenciamento e guarda o id de lá. */
async function syncEvent(eventId) {
  if (!config()) return null;
  const result = await postgres.query("SELECT * FROM events WHERE id = $1", [eventId]);
  const event = result.rows[0];
  if (!event || !event.ticketed) return null;

  const key = event.credenciamento_key || eventKey(event);
  const data = await call("PUT", `eventos/${key}`, {
    nome: event.title,
    local: event.location || undefined,
    descricao: event.description || undefined,
    dataInicio: event.starts_at,
    dataFim: event.ends_at || undefined,
  });
  await postgres.query(
    "UPDATE events SET credenciamento_key = $1, credenciamento_event_id = $2 WHERE id = $3",
    [key, data.eventoId, event.id],
  );
  return data.eventoId;
}

/** Eventos com ingresso que ainda não terminaram. */
async function openTicketedEvents() {
  const result = await postgres.query(`
    SELECT *,
      to_char(ticket_window_start, 'YYYY-MM-DD') AS win_start,
      to_char(ticket_window_end, 'YYYY-MM-DD') AS win_end
    FROM events
    WHERE ticketed = TRUE AND COALESCE(ends_at, starts_at + INTERVAL '1 day') >= CURRENT_TIMESTAMP
    ORDER BY starts_at ASC
  `);
  return result.rows;
}

/** O cliente está entre os N primeiros a assinar o 360 (por ordem de assinatura)? */
async function isAmongFirstSubscribers(memberId, limit) {
  const result = await postgres.query(
    `
      SELECT 1 FROM (
        SELECT id FROM members
        WHERE is_platform_admin = FALSE
        ORDER BY COALESCE(purchase_date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date) ASC, created_at ASC
        LIMIT $1
      ) primeiros
      WHERE primeiros.id = $2
    `,
    [limit, memberId],
  );
  return result.rows.length > 0;
}

/**
 * O evento pode exigir que o cliente tenha começado a assinar dentro de uma
 * janela (ex.: Evento Anual só para quem assinou em out/nov 2026). Sem janela, vale
 * para qualquer assinante do plano. A assinatura estar ativa na data do evento
 * é garantida à parte: ingresso de quem deixa de pagar é bloqueado.
 */
function withinTicketWindow(member, event) {
  if (!event.win_start && !event.win_end) return true;
  const start = member.sub_start;
  if (!start) return false;
  if (event.win_start && start < event.win_start) return false;
  if (event.win_end && start > event.win_end) return false;
  return true;
}

/**
 * Deixa os ingressos do cliente de acordo com a assinatura: emite os que
 * faltam para os eventos do plano dele e marca para bloquear os que ele não
 * tem mais direito. Chamado na compra, na renovação, no cancelamento e quando
 * um evento passa a ter ingresso.
 */
async function syncMemberTickets(memberId) {
  // sub_start: quando o cliente começou a assinar, pela data local. Usa a data
  // da compra (cadastro manual) ou, na falta, a criação da conta (1ª compra).
  const memberResult = await postgres.query(
    `
      SELECT *,
        COALESCE(purchase_date::text, to_char((created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD')) AS sub_start
      FROM members WHERE id = $1
    `,
    [memberId],
  );
  const member = memberResult.rows[0];
  if (!member || member.is_platform_admin) return;

  for (const event of await openTicketedEvents()) {
    // Base: assinatura ativa e plano que cobre o evento.
    let entitled = member.plan_status === "active" && planIncludes(member.plan, event.plan);
    // Com janela e/ou bônus dos primeiros N, vale um critério OU o outro.
    if (entitled && (event.win_start || event.win_end || event.ticket_bonus_limit)) {
      const porJanela = (event.win_start || event.win_end) && withinTicketWindow(member, event);
      const porBonus =
        event.ticket_bonus_limit && (await isAmongFirstSubscribers(member.id, event.ticket_bonus_limit));
      entitled = Boolean(porJanela || porBonus);
    }

    if (entitled) {
      const pair = createQrPair();
      await postgres.query(
        `
          INSERT INTO event_tickets (id, event_id, member_id, code, public_id, token, desired, sync_status)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', 'pending')
          ON CONFLICT (event_id, member_id) DO UPDATE SET
            public_id = COALESCE(event_tickets.public_id, EXCLUDED.public_id),
            token = COALESCE(event_tickets.token, EXCLUDED.token),
            sync_status = CASE
              WHEN event_tickets.desired = 'active' AND event_tickets.sync_status = 'ok' THEN 'ok'
              ELSE 'pending'
            END,
            desired = 'active'
        `,
        [createId("ticket"), event.id, member.id, createTicketCode(), pair.publicId, pair.token],
      );
    } else {
      await postgres.query(
        `
          UPDATE event_tickets SET desired = 'blocked', sync_status = 'pending'
          WHERE event_id = $1 AND member_id = $2 AND desired <> 'blocked'
        `,
        [event.id, member.id],
      );
    }
  }
}

// Sem 0/O e 1/I, para ninguém errar ao digitar o código na entrada.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createTicketCode() {
  let code = "";
  for (const byte of crypto.randomBytes(10)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Avisa por e-mail quem teve ingresso emitido e ainda não foi avisado. Com o
 * credenciamento ligado, espera o ingresso estar registrado lá. Cada ingresso
 * é marcado antes do envio, para duas rodadas não avisarem o mesmo cliente.
 */
async function notifyNewTickets() {
  const due = await postgres.query(
    `
      SELECT t.id, t.code, t.member_id, m.name, m.email, e.title, e.starts_at, e.ends_at, e.location
      FROM event_tickets t
      INNER JOIN events e ON e.id = t.event_id
      INNER JOIN members m ON m.id = t.member_id
      WHERE t.notified_at IS NULL AND t.desired = 'active' AND e.ticketed = TRUE
        AND m.plan_status = 'active' AND m.is_platform_admin = FALSE
        AND COALESCE(e.ends_at, e.starts_at + INTERVAL '1 day') >= CURRENT_TIMESTAMP
        AND ($1::boolean OR t.sync_status = 'ok')
      ORDER BY t.created_at ASC
      LIMIT 50
    `,
    [!config()],
  );

  for (const ticket of due.rows) {
    const claimed = await postgres.query(
      "UPDATE event_tickets SET notified_at = CURRENT_TIMESTAMP WHERE id = $1 AND notified_at IS NULL RETURNING id",
      [ticket.id],
    );
    if (claimed.rowCount === 0) continue;

    const sent = await sendTicketIssuedEmail({
      to: ticket.email,
      name: ticket.name,
      eventTitle: ticket.title,
      startsAt: ticket.starts_at,
      endsAt: ticket.ends_at,
      location: ticket.location,
      code: ticket.code,
      track: { memberId: ticket.member_id, kind: "ticket" },
    });
    if (!sent) {
      // Falhou: a próxima rodada tenta de novo.
      await postgres.query("UPDATE event_tickets SET notified_at = NULL WHERE id = $1", [ticket.id]);
    }
  }
}

let running = false;

/** Envia ao credenciamento o que está pendente e avisa os clientes. Uma rodada por vez. */
async function processTickets() {
  try {
    await pushPendingTickets();
  } finally {
    await notifyNewTickets().catch((error) =>
      console.error("[ingressos] falha ao avisar por e-mail", error?.message || error),
    );
  }
}

async function pushPendingTickets() {
  if (running || !config()) return;
  running = true;
  try {
    const due = await postgres.query(`
      SELECT t.*, e.credenciamento_event_id, m.name, m.email
      FROM event_tickets t
      INNER JOIN events e ON e.id = t.event_id
      INNER JOIN members m ON m.id = t.member_id
      WHERE t.sync_status = 'pending' AND e.ticketed = TRUE
      ORDER BY t.created_at ASC
      LIMIT 50
    `);

    for (const ticket of due.rows) {
      try {
        const eventoId = ticket.credenciamento_event_id || (await syncEvent(ticket.event_id));
        if (!eventoId) continue;

        if (ticket.desired === "blocked") {
          await call("POST", "participantes/bloquear", { eventoId, referencia: ticket.member_id });
        } else {
          await call("POST", "participantes", {
            eventoId,
            referencia: ticket.member_id,
            nome: ticket.name,
            email: ticket.email,
            publicId: ticket.public_id,
            token: ticket.token,
          });
        }
        await postgres.query(
          "UPDATE event_tickets SET sync_status = 'ok', sync_error = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = $1",
          [ticket.id],
        );
      } catch (error) {
        // Fica pendente: a próxima rodada tenta de novo.
        await postgres.query("UPDATE event_tickets SET sync_error = $1 WHERE id = $2", [
          String(error?.name === "AbortError" ? "O credenciamento não respondeu a tempo." : error?.message || error).slice(0, 500),
          ticket.id,
        ]);
        console.error(`[ingressos] credenciamento falhou para o ingresso ${ticket.id}`);
      }
    }
  } finally {
    running = false;
  }
}

/** Versões que nunca lançam: mudança de assinatura não pode falhar por causa disto. */
function syncMemberTicketsSafely(memberId) {
  return syncMemberTickets(memberId)
    .then(() => processTickets())
    .catch((error) => console.error("[ingressos] falha ao sincronizar", memberId, error?.message || error));
}

/** Evento criado ou alterado: garante o evento lá e os ingressos de quem tem direito. */
async function syncEventSafely(eventId) {
  try {
    await syncEvent(eventId);
    const event = await postgres.query("SELECT ticketed FROM events WHERE id = $1", [eventId]);
    if (!event.rows[0]?.ticketed) return;
    const members = await postgres.query(
      "SELECT id FROM members WHERE is_platform_admin = FALSE AND plan_status = 'active'",
    );
    for (const row of members.rows) await syncMemberTickets(row.id);
    await processTickets();
  } catch (error) {
    console.error("[ingressos] falha ao sincronizar o evento", eventId, error?.message || error);
  }
}

/**
 * Cancela no credenciamento todos os ingressos de um evento. Chamado antes de
 * excluir o evento: sem isto, o CASCADE apaga os ingressos aqui mas o
 * credenciamento ficaria com eles válidos (órfãos). Lança se algum bloqueio
 * falhar, para a exclusão não seguir e deixar órfão.
 */
async function blockEventTickets(eventId) {
  if (!config()) return;

  await postgres.query(
    "UPDATE event_tickets SET desired = 'blocked', sync_status = 'pending' WHERE event_id = $1 AND desired <> 'blocked'",
    [eventId],
  );

  const tickets = await postgres.query(
    `
      SELECT t.member_id, e.credenciamento_event_id
      FROM event_tickets t
      INNER JOIN events e ON e.id = t.event_id
      WHERE t.event_id = $1
    `,
    [eventId],
  );

  for (const ticket of tickets.rows) {
    const eventoId = ticket.credenciamento_event_id || (await syncEvent(eventId));
    if (!eventoId) continue;
    // Idempotente lá: participante inexistente volta "nao_encontrado" sem erro.
    await call("POST", "participantes/bloquear", { eventoId, referencia: ticket.member_id });
    await postgres.query(
      "UPDATE event_tickets SET sync_status = 'ok', sync_error = NULL, synced_at = CURRENT_TIMESTAMP WHERE event_id = $1 AND member_id = $2",
      [eventId, ticket.member_id],
    );
  }
}

function startCredenciamentoWorker() {
  const tick = () =>
    processTickets().catch((error) =>
      console.error("[ingressos] falha na fila do credenciamento", error?.message || error),
    );
  setInterval(tick, WORKER_INTERVAL_MS).unref();
}

module.exports = {
  isCredenciamentoConfigured,
  createQrPair,
  createTicketCode,
  qrContent,
  syncEvent,
  syncEventSafely,
  blockEventTickets,
  syncMemberTickets,
  syncMemberTicketsSafely,
  processTickets,
  startCredenciamentoWorker,
};
