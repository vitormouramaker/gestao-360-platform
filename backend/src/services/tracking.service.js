const { isValidPlan, normalizePlan } = require("./plans.service");

/**
 * Regras compartilhadas entre a área do aluno e o painel de administração
 * para atividades práticas e eventos do calendário.
 */

// Para quem uma atividade prática é publicada. Hoje o entregável é só do
// Premium; a coluna existe para o dia em que outro plano também receber.
const ACTIVITY_AUDIENCES = {
  premium: "Plano Premium",
};

const EVENT_TYPES = {
  treinamento: "Treinamento ao Vivo",
  encontro: "Encontro Mensal ao Vivo",
  summit: "Summit Presencial",
};

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

function readText(value, { field, label, max, required = false }) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) throw new ValidationError(`Informe ${label}.`, field);
    return null;
  }
  if (text.length > max) {
    throw new ValidationError(`${label} pode ter no máximo ${max} caracteres.`, field);
  }
  return text;
}

function readUrl(value, { field, label }) {
  const text = readText(value, { field, label, max: 2000 });
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError(`${label}: informe um endereço completo, começando com https://`, field);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError(`${label}: informe um endereço começando com https://`, field);
  }
  return url.toString();
}

function readDate(value, { field, label }) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new ValidationError(`${label}: data inválida.`, field);
  }
  return text;
}

function readDateTime(value, { field, label, required = false }) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) throw new ValidationError(`Informe ${label}.`, field);
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label}: data e hora inválidas.`, field);
  }
  return date;
}

function readActivityInput(body = {}) {
  return {
    audience: "premium",
    title: readText(body.title, { field: "title", label: "o título", max: 255, required: true }),
    description: readText(body.description, { field: "description", label: "A descrição", max: 5000 }),
    dueDate: readDate(body.dueDate, { field: "dueDate", label: "Prazo" }),
  };
}

function readEventInput(body = {}) {
  if (!EVENT_TYPES[body.type]) {
    throw new ValidationError("Escolha o tipo do evento.", "type");
  }
  if (!isValidPlan(body.plan)) {
    throw new ValidationError("Escolha para qual plano o evento vale.", "plan");
  }

  const startsAt = readDateTime(body.startsAt, {
    field: "startsAt",
    label: "a data e a hora de início",
    required: true,
  });
  const endsAt = readDateTime(body.endsAt, { field: "endsAt", label: "Término" });
  if (endsAt && endsAt <= startsAt) {
    throw new ValidationError("O término precisa ser depois do início.", "endsAt");
  }

  // Janela de assinatura que dá direito ao ingresso. Vazio = qualquer assinante
  // ativo do plano. Só faz sentido em evento com ingresso.
  const ticketWindowStart = readDate(body.ticketWindowStart, {
    field: "ticketWindowStart",
    label: "Início da janela de assinatura",
  });
  const ticketWindowEnd = readDate(body.ticketWindowEnd, {
    field: "ticketWindowEnd",
    label: "Fim da janela de assinatura",
  });
  if (ticketWindowStart && ticketWindowEnd && ticketWindowEnd < ticketWindowStart) {
    throw new ValidationError("O fim da janela precisa ser igual ou depois do início.", "ticketWindowEnd");
  }

  // Bônus para os N primeiros assinantes (vazio = sem bônus por ordem de chegada).
  let ticketBonusLimit = null;
  if (body.ticketBonusLimit !== undefined && body.ticketBonusLimit !== null && body.ticketBonusLimit !== "") {
    ticketBonusLimit = Number.parseInt(body.ticketBonusLimit, 10);
    if (!Number.isInteger(ticketBonusLimit) || ticketBonusLimit < 1 || ticketBonusLimit > 100000) {
      throw new ValidationError("O número de primeiros assinantes precisa ser um inteiro positivo.", "ticketBonusLimit");
    }
  }

  return {
    type: body.type,
    plan: normalizePlan(body.plan),
    title: readText(body.title, { field: "title", label: "o título", max: 255, required: true }),
    description: readText(body.description, { field: "description", label: "A descrição", max: 5000 }),
    startsAt,
    endsAt,
    location: readText(body.location, { field: "location", label: "O local", max: 500 }),
    meetingUrl: readUrl(body.meetingUrl, { field: "meetingUrl", label: "Link da transmissão" }),
    recordingUrl: readUrl(body.recordingUrl, { field: "recordingUrl", label: "Link da gravação" }),
    // Evento presencial com ingresso próprio (QR code) emitido pela plataforma.
    ticketed: body.ticketed === true,
    ticketWindowStart,
    ticketWindowEnd,
    ticketBonusLimit,
  };
}

function serializeActivity(row) {
  return {
    id: row.id,
    audience: row.audience,
    audienceLabel: ACTIVITY_AUDIENCES[row.audience] || row.audience,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    publishedAt: row.published_at,
    // Só vem preenchido na visão do aluno.
    done: Boolean(row.completed_at),
    completedAt: row.completed_at || null,
  };
}

/** Evento que o plano de quem lê não cobre sai sem os links (locked). */
function serializeEvent(row, { locked = false } = {}) {
  return {
    id: row.id,
    type: row.type,
    typeLabel: EVENT_TYPES[row.type] || row.type,
    plan: normalizePlan(row.plan),
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locked,
    ticketed: Boolean(row.ticketed),
    ticketWindowStart: ymdOrNull(row.ticket_window_start),
    ticketWindowEnd: ymdOrNull(row.ticket_window_end),
    ticketBonusLimit: row.ticket_bonus_limit ?? null,
    meetingUrl: locked ? null : row.meeting_url,
    recordingUrl: locked ? null : row.recording_url,
  };
}

/** DATE do Postgres (Date ou string) em 'YYYY-MM-DD', pela data local, ou null. */
function ymdOrNull(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sendError(res, error, fallbackMessage) {
  if (error?.status && error.status < 500) {
    return res.status(error.status).json({ message: error.message, field: error.field || undefined });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
}

module.exports = {
  ACTIVITY_AUDIENCES,
  EVENT_TYPES,
  ValidationError,
  readText,
  readUrl,
  readDate,
  readActivityInput,
  readEventInput,
  serializeActivity,
  serializeEvent,
  sendError,
};
