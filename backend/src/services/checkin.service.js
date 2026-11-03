/**
 * Check-in mensal de autogestão (ver metodologia.md): três perguntas
 * rápidas e uma devolutiva curta. Não acompanha tarefa por tarefa e não
 * recalcula a maturidade.
 */

const PROGRESS_OPTIONS = [
  { id: "avancei_bem", label: "Avancei bem" },
  { id: "avancei_parcialmente", label: "Avancei parcialmente" },
  { id: "travei", label: "Travei" },
  { id: "nao_comecei", label: "Ainda não comecei" },
];

const REASON_OPTIONS = [
  { id: "falta_tempo", label: "Falta de tempo" },
  { id: "nao_soube_executar", label: "Não soube como executar" },
  { id: "dependia_outra_pessoa", label: "Dependia de outra pessoa" },
  { id: "mudaram_prioridades", label: "Mudaram as prioridades" },
  { id: "faltou_informacao", label: "Faltou informação ou dado" },
  { id: "outro", label: "Outro" },
];

// Devolutiva por motivo, voltada a retomar. Texto fixo até a IA assumir.
const RETOMADA = {
  falta_tempo:
    "Quando o tempo é o limite, o caminho é diminuir o tamanho do passo. Escolha uma única ação do plano e reserve um horário fixo na semana só para ela, mesmo que curto.",
  nao_soube_executar:
    "Volte ao passo a passo da ação e ao conteúdo recomendado nela. Se a dúvida continuar, leve para o grupo ou para o próximo encontro ao vivo com a pergunta já formulada.",
  dependia_outra_pessoa:
    "Defina com essa pessoa o que você precisa receber e até quando. Enquanto espera, avance no passo que depende só de você.",
  mudaram_prioridades:
    "Mudança de prioridade acontece. Confira se o que entrou no lugar resolve a causa apontada no seu diagnóstico. Se não resolve, retome a ação ativa antes de abrir outra frente.",
  faltou_informacao:
    "A falta do dado é o próprio próximo passo. Levante só a informação que está bloqueando a decisão, com o que já existe na empresa, e siga a partir dela.",
  outro:
    "Identifique o que travou e transforme isso no primeiro passo desta semana. Uma ação por vez é suficiente para voltar a andar.",
};

const DEVOLUTIVA = {
  avancei_bem:
    "Bom mês de execução. Confira os indicadores das ações concluídas para ver se a implantação está gerando efeito e siga para o próximo passo da sua rota.",
  avancei_parcialmente:
    "Você avançou, e isso conta. Veja qual ação ficou pela metade e conclua essa antes de começar outra.",
};

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isValidProgress(value) {
  return PROGRESS_OPTIONS.some((option) => option.id === value);
}

function isValidReason(value) {
  return REASON_OPTIONS.some((option) => option.id === value);
}

/** Quem avançou bem não precisa informar motivo de bloqueio. */
function needsReason(progress) {
  return progress !== "avancei_bem";
}

function buildFeedback(progress, reason) {
  const parts = [];
  if (DEVOLUTIVA[progress]) parts.push(DEVOLUTIVA[progress]);
  if (needsReason(progress) && RETOMADA[reason]) parts.push(RETOMADA[reason]);
  return parts.join(" ");
}

function serializeCheckin(row) {
  return {
    id: row.id,
    period: row.period,
    progress: row.progress,
    progressLabel: PROGRESS_OPTIONS.find((option) => option.id === row.progress)?.label || row.progress,
    reason: row.reason,
    reasonLabel: REASON_OPTIONS.find((option) => option.id === row.reason)?.label || null,
    evolution: row.evolution,
    feedback: row.feedback,
    createdAt: row.created_at,
  };
}

module.exports = {
  PROGRESS_OPTIONS,
  REASON_OPTIONS,
  currentPeriod,
  isValidProgress,
  isValidReason,
  needsReason,
  buildFeedback,
  serializeCheckin,
};
