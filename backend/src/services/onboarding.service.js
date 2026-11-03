const { postgres } = require("../server/connect");
const {
  sendOnboardingBookedEmail,
  sendOnboardingLinkEmail,
  sendOnboardingRescheduledEmail,
  sendOnboardingTeamEmail,
} = require("../server/email");
const { createId } = require("../utils/ids");
const { normalizePhone } = require("../utils/phone");
const { normalizePlan } = require("./plans.service");
const { getSettings, whatsappUrl } = require("./settings.service");
const { ValidationError } = require("./tracking.service");

/**
 * Integração do CRM: o cliente escolhe um dia e um horário para uma chamada
 * de vídeo com a equipe, que depois cadastra o link da chamada. Os horários
 * oferecidos vêm das configurações (dias da semana, início, fim e duração).
 * Um horário atende um cliente só, e cada cliente tem no máximo um
 * agendamento em aberto: agendar de novo troca o anterior.
 */

// O Brasil não tem mais horário de verão: o deslocamento é fixo.
const UTC_OFFSET = "-03:00";
const TIME_ZONE = "America/Sao_Paulo";
// Até quantos dias à frente o cliente pode agendar.
const DAYS_AHEAD = 30;
// Antecedência mínima, para a equipe conseguir se organizar.
const MIN_NOTICE_MS = 12 * 60 * 60 * 1000;
// Campo de WhatsApp da anamnese, usado para já trazer o número preenchido.
const ANAMNESE_PHONE_QUESTION = "q03";

class OnboardingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "HH:MM" de um timestamp, no fuso  Brasília. */
function clockAt(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

/** "DD/MM" de um timestamp, no fuso  Brasília. */
function dayAt(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

/**
 * Já existe uma integração marcada que cruza a faixa [start, end)? Diferente do
 * índice único (que só barra o mesmo horário de início), isto pega qualquer
 * sobreposição de horário, inclusive quando um reagendamento da equipe ou uma
 * troca de configuração coloca uma call fora da grade. Devolve a call em
 * conflito (com o nome do aluno) ou null.
 */
async function findOverlap(db, { start, end, excludeCallId = null, excludeMemberId = null }) {
  const params = [start.toISOString(), end.toISOString()];
  let sql = `
    SELECT c.id, c.starts_at, c.ends_at, m.name
    FROM onboarding_calls c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.status = 'scheduled' AND c.starts_at < $2 AND c.ends_at > $1
  `;
  if (excludeCallId) {
    params.push(excludeCallId);
    sql += ` AND c.id <> $${params.length}`;
  }
  if (excludeMemberId) {
    params.push(excludeMemberId);
    sql += ` AND c.member_id <> $${params.length}`;
  }
  sql += " ORDER BY c.starts_at ASC LIMIT 1";
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

function overlapMessage(row) {
  return `Esse horário encavala na integração de ${row.name}, das ${clockAt(row.starts_at)} às ${clockAt(row.ends_at)} do dia ${dayAt(row.starts_at)}. Escolha outro horário.`;
}

function readConfig(settings) {
  return {
    days: String(settings.onboardingDays || "")
      .split(",")
      .map((day) => Number.parseInt(day, 10))
      .filter((day) => day >= 0 && day <= 6),
    // Períodos do dia em que há atendimento (o segundo é opcional).
    windows: [
      [settings.onboardingStart, settings.onboardingEnd],
      [settings.onboardingStart2, settings.onboardingEnd2],
    ]
      .filter(([start, end]) => start && end)
      .map(([start, end]) => ({ start: toMinutes(start), end: toMinutes(end) })),
    slotMinutes: Number.parseInt(settings.onboardingSlotMinutes, 10) || 90,
    gapMinutes: Number.parseInt(settings.onboardingGapMinutes, 10) || 0,
  };
}

/** Horários de início de um dia: dentro de cada período, um depois do outro com o intervalo. */
function dayTimes(config) {
  const times = [];
  for (const window of config.windows) {
    for (
      let minutes = window.start;
      minutes + config.slotMinutes <= window.end;
      minutes += config.slotMinutes + config.gapMinutes
    ) {
      times.push(toTime(minutes));
    }
  }
  return times;
}

/** Data de hoje  Brasília, como AAAA-MM-DD. */
function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00${UTC_OFFSET}`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDate(date);
}

function weekday(dateText) {
  return new Date(`${dateText}T12:00:00${UTC_OFFSET}`).getUTCDay();
}

/** Todos os horários oferecidos nos próximos dias, ainda sem olhar a ocupação. */
function buildSlots(config, now = new Date()) {
  const earliest = now.getTime() + MIN_NOTICE_MS;
  const today = localDate(now);
  const times = dayTimes(config);
  const days = [];

  for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
    const date = addDays(today, offset);
    if (!config.days.includes(weekday(date))) continue;

    const slots = [];
    for (const time of times) {
      const startsAt = new Date(`${date}T${time}:00${UTC_OFFSET}`);
      if (startsAt.getTime() >= earliest) slots.push({ startsAt, time });
    }
    if (slots.length > 0) days.push({ date, slots });
  }
  return days;
}

function serializeBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    whatsapp: row.whatsapp,
    status: row.status,
    meetLink: row.meet_link || null,
    createdAt: row.created_at,
    // Registro do aluno (opcional) e o motivo de um reagendamento da equipe.
    // As anotações internas da equipe (admin_notes) nunca vão para o aluno.
    memberNotes: row.member_notes || null,
    rescheduleReason: row.reschedule_reason || null,
  };
}

const NOTES_MAX = 4000;

function readNotes(value, field, message = "Escreva o registro da integração.") {
  const text = String(value ?? "").trim();
  if (!text) throw new ValidationError(message, field);
  return text.slice(0, NOTES_MAX);
}

function readWhatsapp(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    throw new ValidationError("Informe o WhatsApp com DDD.", "whatsapp");
  }
  return digits;
}

async function currentBooking(memberId) {
  const result = await postgres.query(
    "SELECT * FROM onboarding_calls WHERE member_id = $1 AND status = 'scheduled' ORDER BY starts_at DESC LIMIT 1",
    [memberId],
  );
  return result.rows[0] || null;
}

/** A integração do CRM está ligada para este cliente? */
async function memberHasCrm(memberId) {
  const result = await postgres.query("SELECT crm_enabled FROM members WHERE id = $1", [memberId]);
  return result.rows[0]?.crm_enabled !== false;
}

/** Tudo que a tela do cliente precisa: agendamento atual e horários livres. */
async function getMemberOnboarding(memberId) {
  // CRM desligado para este cliente: a integração não aparece para ele.
  if (!(await memberHasCrm(memberId))) return { enabled: false };

  const settings = await getSettings();
  const config = readConfig(settings);

  const [booking, lastDone, taken, anamnese] = await Promise.all([
    currentBooking(memberId),
    postgres.query(
      "SELECT * FROM onboarding_calls WHERE member_id = $1 AND status = 'done' ORDER BY starts_at DESC LIMIT 1",
      [memberId],
    ),
    postgres.query(
      "SELECT starts_at FROM onboarding_calls WHERE status = 'scheduled' AND starts_at >= CURRENT_TIMESTAMP",
    ),
    postgres.query("SELECT answers FROM diagnostics WHERE member_id = $1", [memberId]),
  ]);

  const busy = new Set(taken.rows.map((row) => new Date(row.starts_at).getTime()));
  const previous = await postgres.query(
    "SELECT whatsapp FROM onboarding_calls WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1",
    [memberId],
  );
  const fromAnamnese = String(anamnese.rows[0]?.answers?.[ANAMNESE_PHONE_QUESTION] ?? "").replace(/\D/g, "");

  // Convite para o aluno registrar como foi a integração: aparece a partir de
  // 30 minutos depois do fim da chamada, só enquanto ele ainda não registrou e
  // por até 30 dias (passa disso, deixa de incomodar).
  const review = await postgres.query(
    `
      SELECT * FROM onboarding_calls
      WHERE member_id = $1 AND status <> 'canceled' AND member_notes IS NULL
        AND ends_at <= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
        AND ends_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      ORDER BY ends_at DESC LIMIT 1
    `,
    [memberId],
  );

  return {
    enabled: true,
    booking: serializeBooking(booking),
    lastDone: serializeBooking(lastDone.rows[0]),
    // Chamada que já aconteceu e espera o registro opcional do aluno.
    pendingReview: review.rows[0]
      ? { id: review.rows[0].id, startsAt: review.rows[0].starts_at, endsAt: review.rows[0].ends_at }
      : null,
    whatsapp: previous.rows[0]?.whatsapp || fromAnamnese || "",
    slotMinutes: config.slotMinutes,
    days: buildSlots(config).map((day) => ({
      date: day.date,
      slots: day.slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        time: slot.time,
        available: !busy.has(slot.startsAt.getTime()),
      })),
    })),
  };
}

/** Agenda a chamada; se o cliente já tinha uma em aberto, ela é trocada. */
async function bookOnboarding(memberId, body = {}) {
  if (!(await memberHasCrm(memberId))) {
    throw new OnboardingError("A integração do CRM não está disponível para a sua conta.", 403);
  }
  const whatsapp = readWhatsapp(body.whatsapp);
  const requested = new Date(String(body.startsAt || ""));
  if (Number.isNaN(requested.getTime())) {
    throw new ValidationError("Escolha um dia e um horário.", "startsAt");
  }

  const settings = await getSettings();
  const config = readConfig(settings);
  const offered = buildSlots(config).some((day) =>
    day.slots.some((slot) => slot.startsAt.getTime() === requested.getTime()),
  );
  if (!offered) {
    throw new OnboardingError("Esse horário não está mais disponível. Escolha outro.", 409);
  }

  const memberResult = await postgres.query("SELECT * FROM members WHERE id = $1", [memberId]);
  const member = memberResult.rows[0];
  if (!member) throw new OnboardingError("Usuário da sessão não encontrado.", 401);

  const client = await postgres.connect();
  let booking;
  let replaced = false;
  try {
    await client.query("BEGIN");
    const previous = await client.query(
      "UPDATE onboarding_calls SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE member_id = $1 AND status = 'scheduled' RETURNING id",
      [memberId],
    );
    replaced = previous.rowCount > 0;
    // Nenhuma outra integração pode cruzar esta faixa de horário. A call
    // anterior do próprio aluno já foi cancelada acima, então não conflita.
    const endsAt = new Date(requested.getTime() + config.slotMinutes * 60 * 1000);
    const overlap = await findOverlap(client, { start: requested, end: endsAt, excludeMemberId: memberId });
    if (overlap) {
      throw new OnboardingError(overlapMessage(overlap), 409);
    }
    // O índice único por horário em aberto garante um cliente por horário.
    const inserted = await client.query(
      `
        INSERT INTO onboarding_calls (id, member_id, starts_at, ends_at, whatsapp)
        VALUES ($1, $2, $3, $3::timestamptz + make_interval(mins => $4), $5)
        RETURNING *
      `,
      [createId("call"), memberId, requested.toISOString(), config.slotMinutes, whatsapp],
    );
    booking = inserted.rows[0];
    // O WhatsApp do agendamento completa o cadastro de quem ainda não tem telefone.
    await client.query("UPDATE members SET phone = $2 WHERE id = $1 AND phone IS NULL", [
      memberId,
      normalizePhone(whatsapp),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") {
      throw new OnboardingError("Outra pessoa acabou de escolher esse horário. Escolha outro.", 409);
    }
    throw error;
  } finally {
    client.release();
  }

  // Avisos por e-mail depois de gravar; falha de envio não desfaz o agendamento.
  sendOnboardingBookedEmail({
    to: member.email,
    name: member.name,
    startsAt: booking.starts_at,
    track: { memberId: member.id, kind: "onboarding_booked" },
  }).catch(() => undefined);
  if (settings.supportAlertEmail) {
    sendOnboardingTeamEmail({
      to: settings.supportAlertEmail,
      memberName: member.name,
      memberEmail: member.email,
      whatsapp,
      startsAt: booking.starts_at,
      kind: replaced ? "reagendou" : "agendou",
    }).catch(() => undefined);
  }

  return serializeBooking(booking);
}

async function cancelOnboarding(memberId) {
  const canceled = await postgres.query(
    `
      UPDATE onboarding_calls SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
      WHERE member_id = $1 AND status = 'scheduled'
      RETURNING *
    `,
    [memberId],
  );
  const booking = canceled.rows[0];
  if (!booking) return;

  const [member, settings] = await Promise.all([
    postgres.query("SELECT name, email FROM members WHERE id = $1", [memberId]),
    getSettings(),
  ]);
  if (member.rows[0] && settings.supportAlertEmail) {
    sendOnboardingTeamEmail({
      to: settings.supportAlertEmail,
      memberName: member.rows[0].name,
      memberEmail: member.rows[0].email,
      whatsapp: booking.whatsapp,
      startsAt: booking.starts_at,
      kind: "cancelou",
    }).catch(() => undefined);
  }
}

/** Registro do aluno (opcional): salva na chamada que já aconteceu e ainda não tem registro. */
async function saveMemberNotes(memberId, notes) {
  const text = readNotes(notes, "notes");
  const updated = await postgres.query(
    `
      UPDATE onboarding_calls SET member_notes = $2, member_notes_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM onboarding_calls
        WHERE member_id = $1 AND status <> 'canceled' AND member_notes IS NULL
          AND ends_at <= CURRENT_TIMESTAMP
        ORDER BY ends_at DESC LIMIT 1
      )
      RETURNING *
    `,
    [memberId, text],
  );
  if (updated.rowCount === 0) {
    throw new OnboardingError("Não há integração aguardando o seu registro.", 409);
  }
  return serializeBooking(updated.rows[0]);
}

const CALL_SELECT = `
  SELECT c.*, m.name AS member_name, m.email AS member_email, m.plan AS member_plan
  FROM onboarding_calls c
  INNER JOIN members m ON m.id = c.member_id
`;

function serializeCall(row) {
  return {
    ...serializeBooking(row),
    whatsappUrl: whatsappUrl(row.whatsapp),
    // Para a equipe: o registro interno e quando o aluno registrou.
    adminNotes: row.admin_notes || null,
    memberNotesAt: row.member_notes_at || null,
    member: {
      id: row.member_id,
      name: row.member_name,
      email: row.member_email,
      plan: normalizePlan(row.member_plan),
    },
  };
}

/** Chamadas para a equipe: as marcadas primeiro, depois o histórico recente. */
async function listCalls() {
  const result = await postgres.query(`
    ${CALL_SELECT}
    ORDER BY (c.status = 'scheduled' AND c.starts_at >= CURRENT_TIMESTAMP - INTERVAL '1 day') DESC,
             CASE WHEN c.status = 'scheduled' THEN c.starts_at END ASC,
             c.starts_at DESC
    LIMIT 300
  `);
  return result.rows.map(serializeCall);
}

/** A equipe cadastra o link da chamada ou muda a situação. */
async function updateCall(callId, body = {}) {
  const current = await postgres.query("SELECT * FROM onboarding_calls WHERE id = $1", [callId]);
  const call = current.rows[0];
  if (!call) throw new OnboardingError("Agendamento não encontrado.", 404);

  let meetLink = call.meet_link;
  if (Object.prototype.hasOwnProperty.call(body, "meetLink")) {
    const text = String(body.meetLink ?? "").trim();
    if (text && !/^https?:\/\/\S+$/i.test(text)) {
      throw new ValidationError("Informe o link completo da chamada, começando com https://.", "meetLink");
    }
    meetLink = text ? text.slice(0, 500) : null;
  }

  let status = call.status;
  if (body.status !== undefined) {
    if (!["scheduled", "done", "canceled"].includes(body.status)) {
      throw new ValidationError("Situação inválida.", "status");
    }
    status = body.status;
  }

  // Registro da equipe: pode ser salvo a qualquer momento e é obrigatório para
  // marcar a integração como realizada.
  let adminNotes = call.admin_notes;
  if (Object.prototype.hasOwnProperty.call(body, "adminNotes")) {
    const text = String(body.adminNotes ?? "").trim();
    adminNotes = text ? text.slice(0, NOTES_MAX) : null;
  }
  if (status === "done" && !adminNotes) {
    throw new ValidationError(
      "Registre o que foi feito na integração antes de marcar como realizada.",
      "adminNotes",
    );
  }

  try {
    await postgres.query(
      "UPDATE onboarding_calls SET meet_link = $2, status = $3, admin_notes = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [callId, meetLink, status, adminNotes],
    );
  } catch (error) {
    // Reabrir uma chamada cujo horário já foi ocupado por outro cliente.
    if (error.code === "23505") {
      throw new OnboardingError("Esse horário já está com outro cliente. Peça para reagendar.", 409);
    }
    throw error;
  }

  const updated = await postgres.query(`${CALL_SELECT} WHERE c.id = $1`, [callId]);
  const row = updated.rows[0];

  // Link novo ou trocado numa chamada em aberto: o cliente é avisado.
  if (meetLink && meetLink !== call.meet_link && status === "scheduled") {
    sendOnboardingLinkEmail({
      to: row.member_email,
      name: row.member_name,
      startsAt: row.starts_at,
      meetLink,
      track: { memberId: row.member_id, kind: "onboarding_link" },
    }).catch(() => undefined);
  }
  return serializeCall(row);
}

/** A equipe reagenda a chamada para um novo horário, com um motivo. Avisa o aluno. */
async function rescheduleCall(callId, body = {}) {
  const current = await postgres.query("SELECT * FROM onboarding_calls WHERE id = $1", [callId]);
  const call = current.rows[0];
  if (!call) throw new OnboardingError("Agendamento não encontrado.", 404);
  if (call.status === "canceled") {
    throw new OnboardingError("Esta integração foi cancelada. Peça ao aluno para agendar de novo.", 409);
  }

  const reason = readNotes(body.reason, "reason", "Escreva o motivo do reagendamento.");
  const startsAt = new Date(String(body.startsAt || ""));
  if (Number.isNaN(startsAt.getTime())) {
    throw new ValidationError("Escolha a nova data e o horário.", "startsAt");
  }
  if (startsAt.getTime() < Date.now() + 10 * 60 * 1000) {
    throw new ValidationError("O novo horário precisa estar no futuro.", "startsAt");
  }

  // Mantém a mesma duração da chamada original.
  const durationMs = new Date(call.ends_at).getTime() - new Date(call.starts_at).getTime();
  const endsAt = new Date(startsAt.getTime() + durationMs);

  // Não deixa o novo horário encavalar em outra integração marcada.
  const overlap = await findOverlap(postgres, { start: startsAt, end: endsAt, excludeCallId: callId });
  if (overlap) {
    throw new OnboardingError(overlapMessage(overlap), 409);
  }

  try {
    await postgres.query(
      `
        UPDATE onboarding_calls
        SET starts_at = $2, ends_at = $3, status = 'scheduled', reschedule_reason = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [callId, startsAt.toISOString(), endsAt.toISOString(), reason],
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new OnboardingError("Já existe uma integração marcada para esse horário. Escolha outro.", 409);
    }
    throw error;
  }

  const updated = await postgres.query(`${CALL_SELECT} WHERE c.id = $1`, [callId]);
  const row = updated.rows[0];
  sendOnboardingRescheduledEmail({
    to: row.member_email,
    name: row.member_name,
    startsAt: row.starts_at,
    reason,
    meetLink: row.meet_link || null,
    track: { memberId: row.member_id, kind: "onboarding_booked" },
  }).catch(() => undefined);
  return serializeCall(row);
}

module.exports = {
  OnboardingError,
  getMemberOnboarding,
  bookOnboarding,
  cancelOnboarding,
  saveMemberNotes,
  listCalls,
  updateCall,
  rescheduleCall,
  // Exportado para teste.
  buildSlots,
  dayTimes,
  readConfig,
};
