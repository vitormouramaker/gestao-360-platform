const { postgres } = require("../server/connect");
const { ValidationError } = require("./tracking.service");

/**
 * Configurações que a equipe muda pelo /adm, sem deploy: contato humano do
 * suporte, horário de atendimento e destino dos avisos. Cada uma tem um valor
 * padrão.
 */
const DEFAULTS = {
  // Só dígitos, com DDD. Vazio = a opção de WhatsApp não aparece no chat.
  supportWhatsapp: "",
  // Horário do time humano, no fuso de Brasília.
  supportStart: "09:00",
  supportEnd: "18:00",
  // Dias da semana com atendimento: 0 = domingo ... 6 = sábado.
  supportDays: "0,1,2,3,4,5,6",
  // Atendimento assumido e sem resposta por este tempo volta para a fila.
  supportIdleMinutes: "15",
  supportAlertEmail: "contato@example.com",
  // Integração do CRM: dias em que o cliente pode agendar a chamada com a
  // equipe, os dois períodos do dia (o segundo é opcional), a duração de cada
  // chamada e o intervalo entre uma e outra, em minutos.
  onboardingDays: "1,2,3,4,5",
  onboardingStart: "11:00",
  onboardingEnd: "13:00",
  onboardingStart2: "14:00",
  onboardingEnd2: "17:00",
  onboardingSlotMinutes: "90",
  onboardingGapMinutes: "15",
  // Integração do CRM para NOVOS clientes: "1" = quem assinar ganha CRM
  // (agendar + acesso); "0" = não ganha. Não mexe em quem já tem (grandfather)
  // nem no override por aluno. Começa desligado: a partir da virada, assinante
  // novo não recebe CRM, mas a integração continua pronta para religar.
  crmEnabled: "0",
};

const TIME_ZONE = "America/Sao_Paulo";
const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDays(value) {
  return [...new Set(String(value || "").split(",").map((day) => Number.parseInt(day, 10)))]
    .filter((day) => day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "09:00" vira "9h"; "09:30" vira "9h30". */
function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

/** Horário em texto, do jeito que a IA e o chat mostram ao cliente. */
function describeHours({ supportStart, supportEnd, supportDays }) {
  const days = parseDays(supportDays);
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);

  let when;
  if (days.length === 7) when = "todos os dias";
  else if (days.length === 1) when = DAY_NAMES[days[0]];
  else if (consecutive) when = `de ${DAY_NAMES[days[0]]} a ${DAY_NAMES[days[days.length - 1]]}`;
  else when = `${days.slice(0, -1).map((day) => DAY_NAMES[day]).join(", ")} e ${DAY_NAMES[days[days.length - 1]]}`;

  return `${when}, das ${formatTime(supportStart)} às ${formatTime(supportEnd)}`;
}

/** O time humano está atendendo agora? */
function isSupportOpen(settings, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);

  return (
    parseDays(settings.supportDays).includes(day) &&
    minutes >= toMinutes(settings.supportStart) &&
    minutes < toMinutes(settings.supportEnd)
  );
}

async function getSettings() {
  const result = await postgres.query("SELECT key, value FROM app_settings");
  const stored = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  const settings = Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => [key, stored[key] ?? fallback]),
  );
  return { ...settings, supportHours: describeHours(settings) };
}

function readSettingsInput(body = {}) {
  const whatsapp = String(body.supportWhatsapp ?? "").replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
    throw new ValidationError("WhatsApp: informe o número com DDD, só números.", "supportWhatsapp");
  }

  const start = String(body.supportStart ?? "");
  const end = String(body.supportEnd ?? "");
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
    throw new ValidationError("Informe o início e o fim do atendimento.", "supportStart");
  }
  if (toMinutes(end) <= toMinutes(start)) {
    throw new ValidationError("O fim do atendimento precisa ser depois do início.", "supportEnd");
  }

  const days = parseDays(Array.isArray(body.supportDays) ? body.supportDays.join(",") : body.supportDays);
  if (days.length === 0) {
    throw new ValidationError("Escolha pelo menos um dia de atendimento.", "supportDays");
  }

  const idle = Number.parseInt(body.supportIdleMinutes, 10);
  if (!Number.isInteger(idle) || idle < 2 || idle > 240) {
    throw new ValidationError("Tempo sem resposta: informe de 2 a 240 minutos.", "supportIdleMinutes");
  }

  const emails = String(body.supportAlertEmail ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new ValidationError("E-mail de aviso inválido. Para mais de um, separe por vírgula.", "supportAlertEmail");
  }

  // Tela antiga, sem os campos da integração do CRM: mantém o que está salvo.
  const onboarding = {};
  if (body.onboardingDays !== undefined || body.onboardingStart !== undefined) {
    const onboardingStart = String(body.onboardingStart ?? "");
    const onboardingEnd = String(body.onboardingEnd ?? "");
    if (!TIME_PATTERN.test(onboardingStart) || !TIME_PATTERN.test(onboardingEnd)) {
      throw new ValidationError("Integração CRM: informe o início e o fim dos horários.", "onboardingStart");
    }
    const slot = Number.parseInt(body.onboardingSlotMinutes, 10);
    if (!Number.isInteger(slot) || slot < 15 || slot > 240) {
      throw new ValidationError("Integração CRM: a duração vai de 15 a 240 minutos.", "onboardingSlotMinutes");
    }
    const gap = Number.parseInt(body.onboardingGapMinutes ?? 0, 10);
    if (!Number.isInteger(gap) || gap < 0 || gap > 120) {
      throw new ValidationError("Integração CRM: o intervalo vai de 0 a 120 minutos.", "onboardingGapMinutes");
    }
    if (toMinutes(onboardingEnd) - toMinutes(onboardingStart) < slot) {
      throw new ValidationError("Integração CRM: o primeiro período precisa caber pelo menos uma integração.", "onboardingEnd");
    }

    // Segundo período: os dois campos vazios = não há.
    const onboardingStart2 = String(body.onboardingStart2 ?? "").trim();
    const onboardingEnd2 = String(body.onboardingEnd2 ?? "").trim();
    if (onboardingStart2 || onboardingEnd2) {
      if (!TIME_PATTERN.test(onboardingStart2) || !TIME_PATTERN.test(onboardingEnd2)) {
        throw new ValidationError("Integração CRM: informe o início e o fim do segundo período, ou deixe os dois vazios.", "onboardingStart2");
      }
      if (toMinutes(onboardingStart2) < toMinutes(onboardingEnd)) {
        throw new ValidationError("Integração CRM: o segundo período começa depois do fim do primeiro.", "onboardingStart2");
      }
      if (toMinutes(onboardingEnd2) - toMinutes(onboardingStart2) < slot) {
        throw new ValidationError("Integração CRM: o segundo período precisa caber pelo menos uma integração.", "onboardingEnd2");
      }
    }
    const onboardingDays = parseDays(
      Array.isArray(body.onboardingDays) ? body.onboardingDays.join(",") : body.onboardingDays,
    );
    if (onboardingDays.length === 0) {
      throw new ValidationError("Integração CRM: escolha pelo menos um dia.", "onboardingDays");
    }
    Object.assign(onboarding, {
      onboardingDays: onboardingDays.join(","),
      onboardingStart,
      onboardingEnd,
      onboardingStart2,
      onboardingEnd2,
      onboardingSlotMinutes: String(slot),
      onboardingGapMinutes: String(gap),
    });
  }

  // Botão da integração do CRM: só grava quando a tela mandou o campo.
  const crm = body.crmEnabled === undefined ? {} : { crmEnabled: body.crmEnabled ? "1" : "0" };

  return {
    ...onboarding,
    ...crm,
    supportWhatsapp: whatsapp,
    supportStart: start,
    supportEnd: end,
    supportDays: days.join(","),
    supportIdleMinutes: String(idle),
    supportAlertEmail: emails.join(", "),
  };
}

async function saveSettings(input) {
  for (const [key, value] of Object.entries(input)) {
    await postgres.query(
      `
        INSERT INTO app_settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `,
      [key, value],
    );
  }
  return getSettings();
}

/** Um novo cliente deve nascer com a integração do CRM ligada? */
async function crmEnabledForNew() {
  const settings = await getSettings();
  return settings.crmEnabled === "1";
}

/** Link de conversa do WhatsApp do time; null quando o número não foi cadastrado. */
function whatsappUrl(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return null;
  // Número sem código do país é tratado como do Brasil.
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

module.exports = {
  DEFAULTS,
  describeHours,
  getSettings,
  isSupportOpen,
  crmEnabledForNew,
  readSettingsInput,
  saveSettings,
  whatsappUrl,
};
