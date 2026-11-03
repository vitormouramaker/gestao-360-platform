const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** "ter., 10 de nov. de 2026, 19:00" */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATA_HORA.format(date);
}

const DATA_HORA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Sao_Paulo",
});

/** "15/10/2026, 14:32", sempre no horário de Brasília (registros do painel). */
export function formatDateTimeBrasilia(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATA_HORA_BRASILIA.format(date);
}

/** Aceita data pura ("2026-11-15", sem deslocar o dia pelo fuso) ou data e hora. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATA.format(date);
}

/** Prazo (data pura) que já passou. */
export function isOverdue(dueDate: string | null | undefined) {
  if (!dueDate) return false;
  const hoje = new Date();
  const hojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return dueDate < hojeTexto;
}

/**
 * Máscara de telefone brasileiro enquanto a pessoa digita: "(11) 99999-9999"
 * para celular e "(11) 3222-1234" para fixo. Um 55 colado na frente é descartado.
 */
/** CPF até 11 dígitos, CNPJ com 12 a 14: a máscara acompanha o que é digitado. */
export function formatDocument(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function formatPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${ddd}) ${number}`;
  // Com 11 dígitos é celular (5 + 4); até 10, fixo (4 + 4).
  const cut = number.length === 9 ? 5 : 4;
  return `(${ddd}) ${number.slice(0, cut)}-${number.slice(cut)}`;
}

/** Converte a data da API para o valor de um <input type="datetime-local">. */
export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Converte o valor de um <input type="datetime-local"> para enviar à API. */
export function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
