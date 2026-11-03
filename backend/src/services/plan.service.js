const { postgres } = require("../server/connect");
const { describeTools, getToolsForPlan } = require("./tools.service");
const { createId } = require("../utils/ids");
const {
  AGENT_VERSIONS,
  describeAgentError,
  generatePlanDraft,
  isAgentConfigured,
} = require("./agent.service");
const { computeMaturity } = require("./anamnese-matrix");
const { FORMACAO_EXECUTIVA, ACADEMY_COURSES } = require("./content-catalog");
const { planIncludes } = require("./plans.service");

/**
 * Diagnóstico 360° + Plano de Ação: o documento que o cliente recebe.
 *
 * A estrutura do conteúdo segue src/agent/knowledge/arquitetura.md, e as
 * regras de approveErrors são as validações obrigatórias antes da publicação.
 *
 * Ciclo de vida: pending (fila de revisão da equipe) -> approved (visível
 * para o aluno). Quando o plano acaba, abre-se um novo ciclo, que passa pela
 * mesma revisão; até lá o aluno continua vendo o ciclo aprovado anterior.
 */

// Pilares do mapa de maturidade. Tecnologia é sinal transversal, não entra aqui.
const PILLARS = [
  { id: "financeiro", name: "Financeiro" },
  { id: "vendas", name: "Vendas e Comercial" },
  { id: "marketing", name: "Marketing" },
  { id: "processos", name: "Processos e Operação" },
  { id: "pessoas", name: "Pessoas e Liderança" },
];

// Régua de maturidade. A faixa é só representação visual do estágio.
const STAGES = [
  { id: "reativo", name: "Reativo", range: "0 a 2,9" },
  { id: "em_organizacao", name: "Em organização", range: "3 a 4,9" },
  { id: "estruturado", name: "Estruturado", range: "5 a 7,4" },
  { id: "gerencial", name: "Gerencial", range: "7,5 a 10" },
];

const MAX_ACTIONS = 3;
const MAX_INDICATORS = 3;
const MAX_NEXT_STEPS = 3;
// Prazo que a equipe tem para revisar e devolver: 72 horas úteis.
const REVIEW_BUSINESS_DAYS = 3;

function text(value, max = 3000) {
  return String(value ?? "").trim().slice(0, max);
}

/** Lista de linhas: aceita array ou texto com uma linha por item. */
function lines(value, maxItems = 12, max = 600) {
  const items = Array.isArray(value) ? value : String(value ?? "").split("\n");
  return items
    .map((item) => text(item, max))
    .filter(Boolean)
    .slice(0, maxItems);
}

function emptyContent() {
  return {
    identification: { company: "", owner: "", segment: "", city: "" },
    diagnosis: {
      reading: "",
      pillars: PILLARS.map((pillar) => ({
        id: pillar.id,
        stage: "",
        score: null,
        exists: "",
        attention: "",
        requires: "",
      })),
      synthesis: "",
    },
    direction: {
      main: { name: "", why: "", blocks: "", changes: "" },
      complementary: null,
      route: { now: "", next: "", later: "" },
    },
    actions: [],
    development: { ceo: [], team: [] },
    nextStep: { action: "", why: "", steps: [], doneCriteria: "", after: "" },
  };
}

function readPriority(input) {
  return {
    name: text(input?.name, 200),
    why: text(input?.why),
    blocks: text(input?.blocks),
    changes: text(input?.changes),
  };
}

function readScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(String(value).replace(",", "."));
  if (!Number.isFinite(score)) return null;
  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

/**
 * Põe qualquer conteúdo recebido (do editor ou do agente) no formato oficial.
 * Não corta ações nem indicadores a mais: quem barra excesso é approveErrors,
 * para a equipe ver o problema em vez de perder texto em silêncio.
 */
function normalizeContent(input) {
  const source = input && typeof input === "object" ? input : {};
  const base = emptyContent();
  const sourcePillars = Array.isArray(source.diagnosis?.pillars) ? source.diagnosis.pillars : [];
  const complementary = source.direction?.complementary;

  return {
    identification: {
      company: text(source.identification?.company, 200),
      owner: text(source.identification?.owner, 200),
      segment: text(source.identification?.segment, 200),
      city: text(source.identification?.city, 200),
    },
    diagnosis: {
      reading: text(source.diagnosis?.reading),
      pillars: base.diagnosis.pillars.map((pillar) => {
        const found = sourcePillars.find((item) => item?.id === pillar.id) || {};
        return {
          id: pillar.id,
          stage: STAGES.some((stage) => stage.id === found.stage) ? found.stage : "",
          score: readScore(found.score),
          exists: text(found.exists, 600),
          attention: text(found.attention, 600),
          requires: text(found.requires, 600),
        };
      }),
      synthesis: text(source.diagnosis?.synthesis),
    },
    direction: {
      main: readPriority(source.direction?.main),
      // Só existe quando realmente houver uma segunda frente.
      complementary: complementary && text(complementary.name) ? readPriority(complementary) : null,
      route: {
        now: text(source.direction?.route?.now, 600),
        next: text(source.direction?.route?.next, 600),
        later: text(source.direction?.route?.later, 600),
      },
    },
    // Sem limite de ações no plano: a equipe inclui quantas quiser. O corte alto
    // é só uma trava de segurança contra um envio fora do comum.
    actions: (Array.isArray(source.actions) ? source.actions : []).slice(0, 200).map((action) => ({
      id: /^act_[a-f0-9]{16}$/.test(String(action?.id || "")) ? action.id : createId("act"),
      title: text(action?.title, 255),
      why: text(action?.why),
      steps: lines(action?.steps),
      indicators: lines(action?.indicators, 8, 200),
      doneCriteria: text(action?.doneCriteria, 1000),
      content: text(action?.content, 600),
      resource: text(action?.resource, 600),
      crm: text(action?.crm, 600),
    })),
    development: {
      ceo: lines(source.development?.ceo, 12, 200),
      team: lines(source.development?.team, 12, 200),
    },
    nextStep: {
      action: text(source.nextStep?.action, 600),
      why: text(source.nextStep?.why, 1000),
      steps: lines(source.nextStep?.steps, 8),
      doneCriteria: text(source.nextStep?.doneCriteria, 1000),
      after: text(source.nextStep?.after, 600),
    },
  };
}

function collectStrings(value, bucket = []) {
  if (typeof value === "string") bucket.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, bucket));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, bucket));
  return bucket;
}

/**
 * O que impede a aprovação. Lista vazia = pode publicar.
 * memberPlan decide se o Plano de Ação é exigido (ele é entregue só ao Premium).
 */
function approveErrors(content, memberPlan) {
  const errors = [];
  const premium = planIncludes(memberPlan, "premium");

  if (!content.diagnosis.reading) errors.push("Escreva a leitura do momento atual.");
  for (const pillar of content.diagnosis.pillars) {
    if (!pillar.stage) {
      const name = PILLARS.find((item) => item.id === pillar.id).name;
      errors.push(`Defina o estágio de maturidade do pilar ${name}.`);
    }
  }
  if (!content.diagnosis.synthesis) errors.push("Escreva a síntese diagnóstica.");

  if (!content.direction.main.name) errors.push("Defina a prioridade principal.");
  if (!content.direction.main.why) errors.push("Explique por que a prioridade principal vem primeiro.");
  if (!content.direction.route.now) errors.push('Preencha o "Agora" da rota de evolução.');

  if (premium && content.actions.length === 0) {
    errors.push("Inclua ao menos uma ação no plano (cliente Premium).");
  }
  content.actions.forEach((action, index) => {
    const label = action.title || `Ação ${index + 1}`;
    if (!action.title) errors.push(`Ação ${index + 1}: falta o título.`);
    if (!action.why) errors.push(`${label}: explique por que fazer.`);
    if (action.steps.length === 0) errors.push(`${label}: descreva como fazer, em passos.`);
    if (!action.doneCriteria) errors.push(`${label}: falta o critério de conclusão.`);
    if (action.indicators.length > MAX_INDICATORS) {
      errors.push(`${label}: use no máximo ${MAX_INDICATORS} indicadores.`);
    }
  });

  for (const item of content.development.ceo) {
    if (!FORMACAO_EXECUTIVA.includes(item)) errors.push(`"${item}" não está no catálogo da Formação Executiva.`);
  }
  for (const item of content.development.team) {
    if (!ACADEMY_COURSES.includes(item)) errors.push(`"${item}" não está no catálogo da Academy.`);
  }

  if (!content.nextStep.action) errors.push("Defina o próximo passo.");
  if (!content.nextStep.doneCriteria) errors.push("Próximo passo: falta o critério de conclusão.");
  if (content.nextStep.steps.length > MAX_NEXT_STEPS) {
    errors.push(`Próximo passo: use no máximo ${MAX_NEXT_STEPS} passos.`);
  }

  // Regras de linguagem da metodologia.
  const allText = collectStrings(content).join("\n");
  if (/[–—]/.test(allText)) errors.push("O texto contém travessão. Reescreva sem ele.");
  if (/\p{Extended_Pictographic}/u.test(allText)) errors.push("O texto contém emoji. Remova.");

  return errors;
}

/** O que cada plano enxerga: o Plano de Ação e a Rota de Desenvolvimento são do Premium. */
function contentForMember(content, memberPlan) {
  if (planIncludes(memberPlan, "premium")) return content;
  return { ...content, actions: [], development: { ceo: [], team: [] } };
}

/** Data limite da revisão: 72 horas úteis depois do pedido (pula sábado e domingo). */
function reviewDueAt(requestedAt) {
  const due = new Date(requestedAt);
  let remaining = REVIEW_BUSINESS_DAYS;
  while (remaining > 0) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0 && due.getDay() !== 6) remaining -= 1;
  }
  return due;
}

function serializePlan(row, { content } = {}) {
  return {
    id: row.id,
    cycle: row.cycle,
    status: row.status,
    source: row.source,
    content: content || normalizeContent(row.content),
    requestedAt: row.requested_at,
    reviewDueAt: reviewDueAt(row.requested_at),
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
    // Situação do rascunho da IA: none, queued, generating, ready ou failed.
    draftStatus: row.draft_status || "none",
    draftError: row.draft_error || null,
  };
}

async function getProgress(db, planId) {
  const result = await db.query("SELECT * FROM plan_action_progress WHERE plan_id = $1", [planId]);
  return Object.fromEntries(
    result.rows.map((row) => [
      row.action_id,
      { responsible: row.responsible || "", dueDate: row.due_date, done: Boolean(row.completed_at), completedAt: row.completed_at },
    ]),
  );
}

/**
 * Cria o plano do próximo ciclo na fila de revisão. O rascunho vem do agente
 * quando ele estiver ligado; sem ele, a equipe parte da identificação já
 * preenchida (e, a partir do segundo ciclo, do plano anterior).
 */
async function createPendingPlan(db, memberId, { answers = null } = {}) {
  const memberResult = await db.query("SELECT id, name, plan FROM members WHERE id = $1", [memberId]);
  const member = memberResult.rows[0];
  const previousResult = await db.query(
    "SELECT * FROM plans WHERE member_id = $1 ORDER BY cycle DESC LIMIT 1",
    [memberId],
  );
  const previous = previousResult.rows[0] || null;

  if (previous && previous.status === "pending") {
    return previous;
  }

  let memberAnswers = answers;
  if (!memberAnswers) {
    const diagnostic = await db.query("SELECT answers FROM diagnostics WHERE member_id = $1", [memberId]);
    memberAnswers = diagnostic.rows[0]?.answers || {};
  }

  let content;
  if (previous) {
    // Novo ciclo: a leitura anterior serve de ponto de partida e as ações
    // antigas saem, porque o novo plano traz ações novas.
    content = { ...normalizeContent(previous.content), actions: [] };
  } else {
    content = emptyContent();
    // Perguntas 1, 2, 4 e 5 da Matriz.
    content.identification = {
      company: text(memberAnswers.q02, 200),
      owner: text(memberAnswers.q01 || member?.name, 200),
      segment: text(memberAnswers.q05, 200),
      city: text(memberAnswers.q04, 200),
    };
    // O estágio de cada pilar já chega calculado pela Matriz, como ponto de
    // partida. Marketing vai sem nota: a leitura dele é provisória.
    const maturity = computeMaturity(memberAnswers);
    content.diagnosis.pillars = content.diagnosis.pillars.map((pillar) => {
      const computed = maturity.pillars.find((item) => item.id === pillar.id);
      if (!computed || !computed.stage) return pillar;
      return { ...pillar, stage: computed.stage, score: computed.provisional ? null : computed.score };
    });
  }

  // Com a IA ligada o plano nasce na fila do agente; quem chamou dispara a
  // geração com startQueuedDrafts() depois de gravar tudo (ela leva minutos e
  // não pode segurar a requisição nem a transação).
  const result = await db.query(
    `
      INSERT INTO plans (id, member_id, cycle, status, content, source, draft_status)
      VALUES ($1, $2, $3, 'pending', $4, 'manual', $5)
      RETURNING *
    `,
    [
      createId("plan"),
      memberId,
      (previous?.cycle || 0) + 1,
      JSON.stringify(content),
      isAgentConfigured() ? "queued" : "none",
    ],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Rascunho pela IA
// ---------------------------------------------------------------------------

// Geração parada há mais tempo que isto é dada como perdida (servidor reiniciou).
const DRAFT_STALE_MINUTES = 15;

/** Escreve o rascunho de um plano que está na fila. Nunca lança erro. */
async function runPlanDraft(planId) {
  // Só um processo pega cada plano.
  const claimed = await postgres.query(
    `
      UPDATE plans SET draft_status = 'generating', draft_started_at = CURRENT_TIMESTAMP, draft_error = NULL
      WHERE id = $1 AND draft_status = 'queued' AND status = 'pending'
      RETURNING *
    `,
    [planId],
  );
  const plan = claimed.rows[0];
  if (!plan) return;

  try {
    const [member, diagnostic, previous, checkins] = await Promise.all([
      postgres.query("SELECT id, name, plan FROM members WHERE id = $1", [plan.member_id]),
      postgres.query("SELECT answers FROM diagnostics WHERE member_id = $1", [plan.member_id]),
      postgres.query(
        "SELECT * FROM plans WHERE member_id = $1 AND cycle < $2 AND status = 'approved' ORDER BY cycle DESC LIMIT 1",
        [plan.member_id, plan.cycle],
      ),
      postgres.query(
        "SELECT period, progress, reason, evolution FROM checkins WHERE member_id = $1 ORDER BY period DESC LIMIT 6",
        [plan.member_id],
      ),
    ]);
    const memberPlan = member.rows[0]?.plan;
    const previousRow = previous.rows[0] || null;

    const draft = await generatePlanDraft({
      member: member.rows[0],
      answers: diagnostic.rows[0]?.answers || {},
      cycle: plan.cycle,
      previousPlan: previousRow ? normalizeContent(previousRow.content) : null,
      previousProgress: previousRow ? await getProgress(postgres, previousRow.id) : null,
      checkins: checkins.rows,
      instructions: plan.draft_instructions || null,
      tools: describeTools(await getToolsForPlan(memberPlan)),
      validate: (content) => approveErrors(normalizeContent(content), memberPlan),
    });
    if (!draft) throw new Error("A IA não está configurada.");

    await postgres.query(
      `
        UPDATE plans
        SET content = $1, source = 'ia', agent_versions = $2, agent_notes = $3,
            draft_status = 'ready', updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND status = 'pending' AND draft_status = 'generating'
      `,
      [
        JSON.stringify(normalizeContent(draft.content)),
        JSON.stringify({ ...AGENT_VERSIONS, model: draft.model, attempts: draft.attempts, usage: draft.usage }),
        JSON.stringify({ ...draft.notes, remainingErrors: draft.remainingErrors }),
        plan.id,
      ],
    );
    console.log(`[agente] rascunho pronto: plano ${plan.id} (${draft.attempts} tentativa(s))`);
  } catch (error) {
    console.error(`[agente] falha ao gerar o rascunho do plano ${plan.id}:`, error?.message || error);
    await postgres
      .query(
        "UPDATE plans SET draft_status = 'failed', draft_error = $1 WHERE id = $2 AND draft_status = 'generating'",
        [describeAgentError(error), plan.id],
      )
      .catch(() => undefined);
  }
}

/**
 * Dispara, em segundo plano, a geração de tudo que está na fila. Chamada depois
 * de criar um plano, ao pedir nova geração e na subida do servidor.
 */
function startQueuedDrafts() {
  if (!isAgentConfigured()) return;

  postgres
    .query("SELECT id FROM plans WHERE draft_status = 'queued' AND status = 'pending' ORDER BY requested_at ASC")
    .then(async (result) => {
      // Um de cada vez: cada geração já é uma chamada longa.
      for (const row of result.rows) {
        await runPlanDraft(row.id);
      }
    })
    .catch((error) => console.error("[agente] falha ao ler a fila de rascunhos", error?.message || error));
}

/** Na subida do servidor: recupera o que ficou pelo caminho e retoma a fila. */
async function resumeDrafts() {
  await postgres.query(
    `
      UPDATE plans SET draft_status = 'failed', draft_error = 'A geração foi interrompida. Peça um novo rascunho.'
      WHERE draft_status = 'generating'
        AND draft_started_at < CURRENT_TIMESTAMP - make_interval(mins => $1)
    `,
    [DRAFT_STALE_MINUTES],
  );
  startQueuedDrafts();
}

/**
 * Situação do plano para o aluno: o último ciclo aprovado (o que ele enxerga)
 * e, se houver, o ciclo que está em revisão.
 */
async function getMemberPlans(memberId) {
  const result = await postgres.query(
    "SELECT * FROM plans WHERE member_id = $1 ORDER BY cycle DESC",
    [memberId],
  );
  return {
    approved: result.rows.find((row) => row.status === "approved") || null,
    pending: result.rows.find((row) => row.status === "pending") || null,
  };
}

module.exports = {
  PILLARS,
  STAGES,
  MAX_ACTIONS,
  emptyContent,
  normalizeContent,
  approveErrors,
  contentForMember,
  reviewDueAt,
  serializePlan,
  getProgress,
  createPendingPlan,
  startQueuedDrafts,
  resumeDrafts,
  getMemberPlans,
};
