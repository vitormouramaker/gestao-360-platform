/**
 * Datas e horários da integração do CRM. Tudo é mostrado no horário de
 * Brasília, mesmo que o aparelho da pessoa esteja em outro fuso.
 */
const TIME_ZONE = "America/Sao_Paulo";

const DIA_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const DATA_EXTENSA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const DATA_SIMPLES = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
});
const HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

/** Data pura ("2026-10-14") ao meio-dia em UTC, para o dia não mudar com o fuso. */
function parseDay(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInstant(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "2026-10-14" -> "quarta-feira, 14 de outubro" */
export function formatDayLong(date: string) {
  const parsed = parseDay(date);
  return parsed ? DIA_EXTENSO.format(parsed) : date;
}

/** "quarta-feira, 14 de outubro de 2026" */
export function formatCallDate(value: string | null | undefined) {
  const parsed = parseInstant(value);
  return parsed ? DATA_EXTENSA.format(parsed) : "";
}

/** "14 de outubro de 2026" */
export function formatCallDay(value: string | null | undefined) {
  const parsed = parseInstant(value);
  return parsed ? DATA_SIMPLES.format(parsed) : "";
}

/** "15:00" */
export function formatCallTime(value: string | null | undefined) {
  const parsed = parseInstant(value);
  return parsed ? HORA.format(parsed) : "";
}

/** "14/10 às 15:00", para o menu lateral. */
export function formatCallShort(value: string | null | undefined) {
  const parsed = parseInstant(value);
  return parsed ? `${DATA_CURTA.format(parsed)} às ${HORA.format(parsed)}` : "";
}

/** "quarta-feira, 14 de outubro de 2026, às 15:00" */
export function formatCallDateTime(value: string | null | undefined) {
  const parsed = parseInstant(value);
  return parsed ? `${DATA_EXTENSA.format(parsed)}, às ${HORA.format(parsed)}` : "";
}

/** Duração em texto: 45 -> "45 minutos", 60 -> "1 hora", 90 -> "1h30". */
export function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} ${rest === 1 ? "minuto" : "minutos"}`;
  if (rest === 0) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

const MES_TITULO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const HOJE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/** "2026-10-14" -> "2026-10" */
export function monthOf(date: string) {
  return date.slice(0, 7);
}

/** "2026-10" -> "outubro de 2026" */
export function formatMonthTitle(month: string) {
  const parsed = parseDay(`${month}-01`);
  return parsed ? MES_TITULO.format(parsed) : month;
}

/** Hoje ("AAAA-MM-DD") no horário de Brasília. */
export function todayDate(now: Date = new Date()) {
  return HOJE.format(now);
}

/**
 * Semanas de um mês ("2026-10"), de domingo a sábado. Cada casa traz a data
 * ("AAAA-MM-DD") ou null quando fica fora do mês.
 */
export function buildMonthWeeks(month: string): Array<Array<string | null>> {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return [];
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function toMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Horários oferecidos em um dia, pela mesma regra do servidor: em cada período
 * a primeira chamada começa no início do período, a seguinte começa depois da
 * duração mais o intervalo, e só entra a chamada que termina até o fim do período.
 */
export function offeredTimes(
  periods: Array<{ start: string; end: string }>,
  durationMinutes: number,
  gapMinutes: number,
) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return [];
  const gap = Number.isInteger(gapMinutes) && gapMinutes > 0 ? gapMinutes : 0;
  const times: string[] = [];

  for (const period of periods) {
    const start = toMinutes(period.start);
    const end = toMinutes(period.end);
    if (start === null || end === null) continue;
    for (let at = start; at + durationMinutes <= end; at += durationMinutes + gap) {
      times.push(toTime(at));
    }
  }
  return times;
}

/** Só os dígitos do telefone, sem o 55 colado na frente. */
export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

/** WhatsApp com DDD: 10 ou 11 dígitos. */
export function isValidWhatsapp(value: string) {
  const length = phoneDigits(value).length;
  return length === 10 || length === 11;
}

/** Só links http(s) viram botão: nada de outro esquema digitado por engano. */
export function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\/\S+$/i.test(value.trim()));
}
