/**
 * Matriz Operacional da Anamnese do Gestão 360°.
 *
 * Perguntas, opções e pontuação da anamnese (versão de demonstração). O texto
 * das perguntas e das opções é a fonte da verdade da tela e do agente.
 *
 * Cada opção de pergunta pontuada vale de 0 a 3 (0 = inexistente/crítico,
 * 1 = reativo/informal, 2 = parcialmente estruturado, 3 = estruturado e
 * acompanhado). Perguntas de contexto, abertas e de calibração não pontuam.
 * A pontuação é metadado interno: nunca é enviada ao cliente.
 *
 * Ao mudar perguntas ou pontuação, suba MATRIX_VERSION. Os ids (q01...q30)
 * não podem mudar depois que houver respostas gravadas.
 */
const MATRIX_VERSION = "1.1";

const BLOCO = {
  contexto: "Identificação e contexto",
  indicadores: "Indicadores do Negócio",
  financeiro: "Financeiro",
  vendas: "Vendas e comercial",
  marketing: "Marketing",
  processos: "Processos e operação",
  pessoas: "Pessoas e liderança",
  tecnologia: "Tecnologia e organização",
  execucao: "Capacidade de execução",
  abertas: "Perguntas abertas",
};

/** Escolha única pontuada: [texto da opção, pontos]. */
function pontuada(number, section, pillar, label, options) {
  return {
    id: `q${String(number).padStart(2, "0")}`,
    number,
    section,
    pillar,
    label,
    type: "select",
    options: options.map(([text]) => text),
    scores: Object.fromEntries(options),
  };
}

function contexto(number, section, label, type, options) {
  return { id: `q${String(number).padStart(2, "0")}`, number, section, pillar: null, label, type, ...(options ? { options } : {}) };
}

// Indicador numérico do negócio (faturamento, margem, meta, ticket). Valor em
// R$ (moeda) ou % (percentual), ou a opção de desconhecimento/ausência de meta.
// Dado complementar: não entra na pontuação da Matriz (pillar null, sem scores).
// O id é fixo e independente do número exibido; o número é definido pela ordem.
function indicador(id, section, label, type, emptyOption) {
  // Opcional: o cliente pode deixar em branco na anamnese; a equipe preenche
  // depois (hot seat / contato) pelo perfil do aluno no /adm.
  return { id, number: 0, section, pillar: null, label, type, emptyOption, optional: true };
}

// Os quatro indicadores principais da pergunta 13. Ticket médio e taxa de
// conversão são sinais complementares e não entram na pontuação do Financeiro.
const INDICADORES_PRINCIPAIS = ["Faturamento", "Margem de lucro", "Fluxo de caixa", "Custos fixos e variáveis"];
const NENHUM = "Nenhum";

const QUESTIONS = [
  contexto(1, BLOCO.contexto, "Nome do empresário", "text"),
  contexto(2, BLOCO.contexto, "Nome da empresa", "text"),
  contexto(3, BLOCO.contexto, "WhatsApp", "phone"),
  contexto(4, BLOCO.contexto, "Cidade/UF", "text"),
  contexto(5, BLOCO.contexto, "Qual é o segmento principal da empresa?", "text"),
  contexto(6, BLOCO.contexto, "Há quanto tempo a empresa existe?", "select", [
    "Menos de 1 ano",
    "1 a 3 anos",
    "4 a 7 anos",
    "8 a 15 anos",
    "Mais de 15 anos",
  ]),
  contexto(7, BLOCO.contexto, "Qual é o principal produto ou serviço da empresa?", "text"),
  contexto(8, BLOCO.contexto, "Quantas pessoas trabalham hoje na empresa?", "select", [
    "Somente eu",
    "2 a 5",
    "6 a 10",
    "11 a 30",
    "Mais de 30",
  ]),

  // Indicadores do Negócio: entram logo após a pergunta 8 e antes do Financeiro.
  // Ids q31..q36 (fixos); o número exibido (9..14) vem da ordem na tela.
  indicador("q31", BLOCO.indicadores, "Qual foi o faturamento da sua empresa no último mês fechado?", "moeda", "Não sei informar"),
  indicador("q32", BLOCO.indicadores, "Qual foi o faturamento total da sua empresa no último ano fechado?", "moeda", "Não sei informar"),
  indicador("q33", BLOCO.indicadores, "Qual é a margem de lucro líquido atual da sua empresa?", "percentual", "Não sei informar"),
  indicador("q34", BLOCO.indicadores, "Qual é a sua meta de faturamento mensal?", "moeda", "Não possuo meta definida"),
  indicador("q35", BLOCO.indicadores, "Qual é a sua meta de faturamento anual?", "moeda", "Não possuo meta definida"),
  indicador("q36", BLOCO.indicadores, "Qual é o ticket médio atual da sua empresa?", "moeda", "Não sei informar"),

  pontuada(9, BLOCO.financeiro, "financeiro", "Você sabe quanto sua empresa faturou no último mês?", [
    ["Sim, com precisão", 3],
    ["Tenho uma estimativa aproximada", 1],
    ["Não sei", 0],
  ]),
  pontuada(10, BLOCO.financeiro, "financeiro", "Você sabe qual foi o resultado/lucro da empresa no último mês?", [
    ["Sim, com precisão", 3],
    ["Tenho uma noção", 1],
    ["Não sei", 0],
  ]),
  pontuada(11, BLOCO.financeiro, "financeiro", "Você possui DRE gerencial atualizada?", [
    ["Sim, acompanho mensalmente", 3],
    ["Tenho, mas atualizo de forma irregular", 2],
    ["Não tenho", 0],
    ["Não sei o que é DRE", 0],
  ]),
  pontuada(12, BLOCO.financeiro, "financeiro", "Com que frequência você acompanha o fluxo de caixa?", [
    ["Diariamente ou semanalmente", 3],
    ["Mensalmente", 2],
    ["Apenas quando surge um problema", 1],
    ["Não acompanho", 0],
  ]),
  {
    id: "q13",
    number: 13,
    section: BLOCO.financeiro,
    pillar: "financeiro",
    label: "Quais destes indicadores você acompanha hoje?",
    type: "multi",
    options: [...INDICADORES_PRINCIPAIS, "Ticket médio", "Taxa de conversão", NENHUM],
    // "Nenhum" não combina com as outras opções.
    exclusiveOption: NENHUM,
  },

  pontuada(14, BLOCO.vendas, "vendas", "Sua empresa possui uma meta comercial definida?", [
    ["Sim, e acompanhamos com frequência", 3],
    ["Existe uma meta, mas acompanhamos pouco", 1],
    ["Não temos meta definida", 0],
  ]),
  pontuada(15, BLOCO.vendas, "vendas", "Como está estruturado o seu processo de vendas hoje?", [
    ["É definido, documentado e acompanhado", 3],
    ["Existe, mas é informal", 2],
    ["Depende muito de cada vendedor ou do dono", 1],
    ["Não temos um processo definido", 0],
  ]),
  // O uso pesa mais que a ferramenta: planilha organizada vale mais que CRM parado.
  pontuada(16, BLOCO.vendas, "vendas", "Como você registra hoje seus leads e oportunidades?", [
    ["CRM usado de forma frequente", 3],
    ["Tenho CRM, mas uso pouco", 1],
    ["Planilha", 2],
    ["WhatsApp/anotações", 1],
    ["Não registro de forma organizada", 0],
  ]),
  pontuada(17, BLOCO.vendas, "vendas", "Você sabe sua taxa de conversão de oportunidades em vendas?", [
    ["Sim, acompanho", 3],
    ["Tenho uma estimativa", 1],
    ["Não sei", 0],
  ]),
  pontuada(18, BLOCO.vendas, "vendas", "Existe uma rotina de follow-up para oportunidades que ainda não compraram?", [
    ["Sim, com processo definido", 3],
    ["Existe, mas depende da pessoa lembrar", 2],
    ["Fazemos apenas em alguns casos", 1],
    ["Não temos rotina de follow-up", 0],
  ]),

  pontuada(19, BLOCO.marketing, "marketing", "Você possui uma estratégia de marketing definida para o negócio?", [
    ["Sim, está estruturada e em execução", 3],
    ["Tenho algumas ações, mas sem estratégia clara", 2],
    ["Faço ações conforme a necessidade", 1],
    ["Não sei como definir uma estratégia de marketing", 0],
  ]),
  contexto(20, BLOCO.marketing, "De onde vem hoje a maior parte dos seus clientes?", "select", [
    "Indicação",
    "Instagram/redes sociais",
    "Tráfego pago",
    "Prospecção ativa",
    "Parcerias",
    "Loja/ponto físico",
    "Outro",
  ]),

  // A ordem das opções não é a ordem da pontuação: "apenas alguns" documentados
  // vale mais que tudo "na cabeça das pessoas".
  pontuada(21, BLOCO.processos, "processos", "Os principais processos da empresa estão definidos e documentados?", [
    ["Sim, os principais estão documentados", 3],
    ["Existem, mas estão mais na cabeça das pessoas", 1],
    ["Apenas alguns", 2],
    ["Não temos processos definidos", 0],
  ]),
  pontuada(22, BLOCO.processos, "processos", "Qual alternativa descreve melhor sua rotina como empresário?", [
    ["Atuo principalmente de forma estratégica", 3],
    ["Divido meu tempo entre gestão e operação", 2],
    ["Passo a maior parte do tempo na operação", 1],
    ["Vivo apagando incêndios", 0],
  ]),
  pontuada(23, BLOCO.processos, "processos", "Se você se afastasse da empresa por 30 dias, o que provavelmente aconteceria?", [
    ["Funcionaria normalmente", 3],
    ["Funcionaria com algumas dificuldades", 2],
    ["Várias áreas parariam", 1],
    ["A empresa praticamente pararia", 0],
  ]),

  pontuada(24, BLOCO.pessoas, "pessoas", "Sua equipe sabe claramente o que é esperado dela?", [
    ["Sim, com clareza", 3],
    ["Em parte", 2],
    ["Pouco", 1],
    ["Não", 0],
  ]),
  pontuada(25, BLOCO.pessoas, "pessoas", "As pessoas ou áreas da empresa possuem metas ou indicadores claros?", [
    ["Sim, a maioria", 3],
    ["Algumas áreas", 2],
    ["Muito pouco", 1],
    ["Não", 0],
  ]),
  pontuada(26, BLOCO.pessoas, "pessoas", "Sua equipe consegue tomar decisões sem depender de você o tempo todo?", [
    ["Na maior parte das vezes", 3],
    ["Em algumas situações", 2],
    ["Pouco", 1],
    ["Quase nunca", 0],
  ]),

  contexto(27, BLOCO.tecnologia, "Como sua empresa usa sistemas e ferramentas para organizar a gestão hoje?", "select", [
    "Uso sistemas integrados e acompanho os dados",
    "Uso vários sistemas separados",
    "Dependo principalmente de planilhas",
    "A maior parte é manual ou fica no WhatsApp",
  ]),

  contexto(
    28,
    BLOCO.execucao,
    "Quando você recebe uma orientação prática para o negócio, em quanto tempo normalmente consegue colocar em execução?",
    "select",
    ["Executo na mesma semana", "Levo de 2 a 4 semanas", "Levo mais de um mês", "Tenho dificuldade de executar"],
  ),

  contexto(
    29,
    BLOCO.abertas,
    "Se você pudesse resolver um único problema da sua empresa nos próximos meses, qual seria?",
    "textarea",
  ),
  {
    ...contexto(
      30,
      BLOCO.abertas,
      "Existe algum contexto importante sobre sua empresa que precisamos considerar para entender melhor o seu momento?",
      "textarea",
    ),
    optional: true,
  },
];

// O número exibido segue a ordem na tela (1..N). O id é a chave fixa e nunca
// muda, mesmo quando entram perguntas no meio: a pontuação (por id) e os dados
// já gravados continuam valendo. Por isso número (exibição) e id são separados.
QUESTIONS.forEach((question, index) => {
  question.number = index + 1;
});

/** O que vai para a tela: pergunta e opções, sem pilar nem pontuação. */
const PUBLIC_QUESTIONS = QUESTIONS.map((question) => ({
  id: question.id,
  number: question.number,
  section: question.section,
  label: question.label,
  type: question.type,
  ...(question.options ? { options: question.options } : {}),
  ...(question.exclusiveOption ? { exclusiveOption: question.exclusiveOption } : {}),
  ...(question.emptyOption ? { emptyOption: question.emptyOption } : {}),
  ...(question.optional ? { optional: true } : {}),
}));

// ---------------------------------------------------------------------------
// Leitura de maturidade
// ---------------------------------------------------------------------------

// Teto do estágio "Em organização" na conversão visual (0 a 10).
const TETO_EM_ORGANIZACAO = 4.9;

function stageFromScore(score) {
  if (score < 3) return "reativo";
  if (score < 5) return "em_organizacao";
  if (score < 7.5) return "estruturado";
  return "gerencial";
}

/** Pontos (0 a 3) de uma resposta; null quando a pergunta não foi respondida. */
function pointsFor(question, answer) {
  if (question.id === "q13") {
    if (!Array.isArray(answer) || answer.length === 0) return null;
    const principais = answer.filter((item) => INDICADORES_PRINCIPAIS.includes(item)).length;
    if (principais === 0) return 0;
    if (principais === 1) return 1;
    return principais === INDICADORES_PRINCIPAIS.length ? 3 : 2;
  }
  if (!question.scores || typeof answer !== "string") return null;
  return question.scores[answer] ?? null;
}

/**
 * Lê a maturidade de cada pilar a partir das respostas, seguindo as regras da
 * Matriz. A nota de 0 a 10 é só representação visual do estágio. É um ponto de
 * partida para a revisão: quem aprova o plano pode ajustar.
 *
 * Os dois tetos abaixo vêm das regras da Matriz; onde ela não dá o critério
 * exato, a tradução para as respostas está explicada em cada um.
 */
function computeMaturity(answers = {}) {
  const points = Object.fromEntries(QUESTIONS.map((question) => [question.id, pointsFor(question, answers[question.id])]));

  const pillar = (id) => {
    const values = QUESTIONS.filter((question) => question.pillar === id)
      .map((question) => points[question.id])
      .filter((value) => value !== null);
    if (values.length === 0) return { id, score: null, stage: "", notes: [] };

    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const score = Math.round((average / 3) * 100) / 10;
    return { id, score, stage: stageFromScore(score), notes: [] };
  };

  const cap = (item, reason) => {
    if (item.score !== null && item.score > TETO_EM_ORGANIZACAO) {
      item.score = TETO_EM_ORGANIZACAO;
      item.stage = stageFromScore(item.score);
      item.notes.push(reason);
    }
  };

  const financeiro = pillar("financeiro");
  // Matriz: "Se o cliente não souber lucro e também não tiver DRE/rotina
  // financeira, limitar o estágio máximo até Em organização".
  // Aqui: não sabe o lucro (q10 = 0) e não tem DRE (q11 = 0) ou só olha o
  // caixa quando há problema / não olha (q12 <= 1).
  if (points.q10 === 0 && (points.q11 === 0 || (points.q12 !== null && points.q12 <= 1))) {
    cap(financeiro, "Limitado a Em organização: não conhece o resultado e não tem DRE ou rotina de caixa.");
  }

  const vendas = pillar("vendas");
  if (answers.q16 === "Tenho CRM, mas uso pouco") {
    vendas.notes.push("Tem CRM, mas usa pouco: conta como baixa adoção, não como maturidade.");
  }

  const marketing = pillar("marketing");
  // Só a pergunta 19 mede maturidade de marketing: a leitura é provisória e
  // não deve aparecer com precisão de nota.
  marketing.provisional = true;
  marketing.notes.push("Leitura provisória: a anamnese tem uma única pergunta de maturidade em Marketing.");

  const processos = pillar("processos");
  // Matriz: "Dependência forte do dono deve limitar maturidade mesmo que
  // existam processos declarados".
  // Aqui: várias áreas parariam ou a empresa pararia sem o dono (q23 <= 1),
  // ou o dono vive apagando incêndios (q22 = 0).
  if ((points.q23 !== null && points.q23 <= 1) || points.q22 === 0) {
    cap(processos, "Limitado a Em organização: forte dependência do dono.");
  }

  const pessoas = pillar("pessoas");

  // Sinais que não viram nota, mas orientam o plano.
  const signals = [];
  if (Array.isArray(answers.q13) && answers.q13.includes(NENHUM)) {
    signals.push("Não acompanha nenhum indicador: sinal crítico de baixa visibilidade gerencial.");
  }
  if (typeof answers.q20 === "string" && answers.q20) {
    signals.push(`Maior parte dos clientes vem de: ${answers.q20}. Verificar concentração em um único canal.`);
  }
  if (typeof answers.q27 === "string" && answers.q27) {
    signals.push(`Tecnologia (sinal transversal, fora do radar): ${answers.q27}.`);
  }

  // Pergunta 28: calibra o volume do plano, não é nota.
  const execution = {
    answer: typeof answers.q28 === "string" ? answers.q28 : null,
    maxActions:
      answers.q28 === "Executo na mesma semana"
        ? 3
        : answers.q28 === "Levo de 2 a 4 semanas"
          ? 2
          : answers.q28
            ? 1
            : null,
  };

  return {
    version: MATRIX_VERSION,
    pillars: [financeiro, vendas, marketing, processos, pessoas],
    signals,
    execution,
  };
}

module.exports = { MATRIX_VERSION, QUESTIONS, PUBLIC_QUESTIONS, NENHUM, computeMaturity };
