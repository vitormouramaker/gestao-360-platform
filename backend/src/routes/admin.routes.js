const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const { requirePlatformAdmin } = require("../middlewares/platform-admin.middleware");
const { sendWelcome } = require("../services/access.service");
const { sendPlanReadyEmail } = require("../server/email");
const { isAgentConfigured } = require("../services/agent.service");
const { computeMaturity } = require("../services/anamnese-matrix");
const { PROGRESS_OPTIONS, currentPeriod, serializeCheckin } = require("../services/checkin.service");
const { FORMACAO_EXECUTIVA, ACADEMY_COURSES } = require("../services/content-catalog");
const { QUESTIONS, serializeDiagnostic, saveMemberIndicators } = require("../services/diagnostic.service");
const {
  ARTICLE_MAX_CHARS,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_KINDS,
  TOTAL_MAX_CHARS,
  assertFits,
  readKnowledgeInput,
  serializeArticle,
} = require("../services/knowledge.service");
const { readUsageSummary } = require("../services/ai-usage.service");
const {
  blockEventTickets,
  isCredenciamentoConfigured,
  syncEventSafely,
  syncMemberTicketsSafely,
} = require("../services/credenciamento.service");
const { checkInTicket, listEventTickets, readTicketByCode } = require("../services/event-tickets.service");
const { ensureSchema } = require("../services/migrations.service");
const {
  countFailed: countFailedAccounts,
  getMemberAccounts,
  syncMemberSafely,
} = require("../services/provisioning.service");
const { getSettings, crmEnabledForNew, readSettingsInput, saveSettings } = require("../services/settings.service");
const { normalizePhone } = require("../utils/phone");
const { isValidDocument, normalizeDocument } = require("../utils/document");
const { getDeliverySummaries, getMemberDelivery } = require("../services/email-log.service");
const { createAdmin, listAdmins, removeAdmin, resendAdminAccess, updateAdmin } = require("../services/team.service");
const { listMemberEmails, sendGuideOnceSafely, sendMemberEmail } = require("../services/member-emails.service");
const {
  listCalls: listOnboardingCalls,
  updateCall: updateOnboardingCall,
  rescheduleCall: rescheduleOnboardingCall,
} = require("../services/onboarding.service");
const { TOOL_CATEGORIES, readToolInput, serializeTool } = require("../services/tools.service");
const {
  SUPPORT_FLAGS,
  WEEK_DAYS,
  serializeInsight,
  startInsight,
} = require("../services/support-insights.service");
const {
  MAX_ACTIONS,
  PILLARS,
  STAGES,
  approveErrors,
  createPendingPlan,
  getProgress,
  normalizeContent,
  reviewDueAt,
  serializePlan,
  startQueuedDrafts,
} = require("../services/plan.service");
const { PLANS, isValidPlan, normalizePlan } = require("../services/plans.service");
const {
  ACTIVITY_AUDIENCES,
  EVENT_TYPES,
  ValidationError,
  readActivityInput,
  readDate,
  readEventInput,
  readText,
  readUrl,
  sendError,
  serializeActivity,
  serializeEvent,
} = require("../services/tracking.service");
const { createId } = require("../utils/ids");
const { serializeMessage } = require("./support.routes");
const {
  addTeamMessage,
  claimTicket,
  closeTicket,
  countWaiting,
  listTicketsForAdmin,
  readTicketForAdmin,
  releaseTicket,
  serializeTicket,
} = require("../services/support-tickets.service");

// Enquanto a IA escreve, ninguém salva nem aprova por cima.
const DRAFT_BUSY = ["queued", "generating"];

// Painel de administração (/adm): tudo aqui é só para a equipe da Gestão 360.
router.use(verifyToken, requirePlatformAdmin);
router.use(async (_req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    sendError(res, error, "Não foi possível preparar o banco.");
  }
});

// Alunos com o andamento de cada um: anamnese, plano em revisão, plano
// liberado (e quantas ações já concluiu) e o último check-in.
const MEMBERS_WITH_PROGRESS = `
  SELECT m.id, m.name, m.email, m.phone, m.document, m.plan, m.plan_status, m.created_at, m.welcome_sent_at, m.purchase_date, m.crm_enabled,
         (m.password_hash IS NOT NULL) AS has_password,
         d.status AS diagnostic_status, d.submitted_at AS diagnostic_submitted_at,
         pp.id AS pending_plan_id, pp.cycle AS pending_cycle, pp.requested_at AS pending_requested_at,
         ap.id AS approved_plan_id, ap.cycle AS approved_cycle, ap.content AS approved_content,
         (
           SELECT COALESCE(json_agg(x.action_id), '[]'::json)
           FROM plan_action_progress x
           WHERE x.plan_id = ap.id AND x.completed_at IS NOT NULL
         ) AS done_action_ids,
         c.period AS checkin_period, c.progress AS checkin_progress
  FROM members m
  LEFT JOIN diagnostics d ON d.member_id = m.id
  LEFT JOIN LATERAL (
    SELECT * FROM plans WHERE member_id = m.id AND status = 'pending' ORDER BY cycle DESC LIMIT 1
  ) pp ON TRUE
  LEFT JOIN LATERAL (
    SELECT * FROM plans WHERE member_id = m.id AND status = 'approved' ORDER BY cycle DESC LIMIT 1
  ) ap ON TRUE
  LEFT JOIN LATERAL (
    SELECT * FROM checkins WHERE member_id = m.id ORDER BY period DESC LIMIT 1
  ) c ON TRUE
  WHERE m.is_platform_admin = FALSE
`;

/** Telefone opcional do cadastro: vazio = sem telefone; inválido = erro para a equipe corrigir. */
function readOptionalPhone(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const phone = normalizePhone(value);
  if (!phone) throw new ValidationError("WhatsApp: informe o número com DDD.", "phone");
  return phone;
}

/** CPF/CNPJ opcional do cadastro: vazio = sem documento; inválido = erro para a equipe corrigir. */
function readOptionalDocument(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  if (!isValidDocument(value)) throw new ValidationError("CPF ou CNPJ inválido. Confira os números.", "document");
  return normalizeDocument(value);
}

function serializeMember(row) {
  const plan = normalizePlan(row.plan);
  const actions = row.approved_plan_id ? normalizeContent(row.approved_content).actions : [];
  const doneIds = row.done_action_ids || [];

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    // WhatsApp, só dígitos com o código do país (ex.: 5511999991234).
    phone: row.phone || null,
    // CPF (11 dígitos) ou CNPJ (14 dígitos), só números.
    document: row.document || null,
    plan,
    planName: PLANS[plan].name,
    // active = pode entrar; suspended = assinatura caiu.
    accessStatus: row.plan_status,
    // Integração do CRM ligada para este aluno (agendar + acesso CRM).
    crmEnabled: row.crm_enabled !== false,
    // Data da compra informada no cadastro manual ("AAAA-MM-DD"), base do lembrete de renovação.
    purchaseDate: row.purchase_date ? new Date(row.purchase_date).toISOString().slice(0, 10) : null,
    // Ainda não criou a senha: não fez o primeiro acesso.
    hasPassword: row.has_password,
    welcomeSentAt: row.welcome_sent_at,
    createdAt: row.created_at,
    // null = não começou; draft = respondendo; submitted = enviada.
    anamneseStatus: row.diagnostic_status || null,
    anamneseSubmittedAt: row.diagnostic_status === "submitted" ? row.diagnostic_submitted_at : null,
    pendingPlan: row.pending_plan_id
      ? {
          id: row.pending_plan_id,
          cycle: row.pending_cycle,
          requestedAt: row.pending_requested_at,
          dueAt: reviewDueAt(row.pending_requested_at),
        }
      : null,
    approvedPlan: row.approved_plan_id
      ? {
          id: row.approved_plan_id,
          cycle: row.approved_cycle,
          actionsTotal: actions.length,
          actionsDone: actions.filter((action) => doneIds.includes(action.id)).length,
        }
      : null,
    lastCheckin: row.checkin_period
      ? {
          period: row.checkin_period,
          progress: row.checkin_progress,
          progressLabel:
            PROGRESS_OPTIONS.find((option) => option.id === row.checkin_progress)?.label ||
            row.checkin_progress,
        }
      : null,
  };
}

async function findStudent(memberId) {
  const result = await postgres.query(`${MEMBERS_WITH_PROGRESS} AND m.id = $1`, [memberId]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

router.get("/overview", async (_req, res) => {
  try {
    const [members, events, waiting, flagged, supportQueue] = await Promise.all([
      postgres.query(`${MEMBERS_WITH_PROGRESS} ORDER BY m.name ASC`),
      postgres.query(
        "SELECT * FROM events WHERE starts_at >= CURRENT_TIMESTAMP ORDER BY starts_at ASC LIMIT 5",
      ),
      // Quem a IA orientou a procurar o time humano nos últimos 7 dias, com a
      // pergunta que levou a isso. O atendimento em si acontece no WhatsApp.
      postgres.query(`
        SELECT last.member_id, last.created_at, m.name,
               (
                 SELECT u.content FROM support_messages u
                 WHERE u.member_id = last.member_id AND u.role = 'user' AND u.created_at <= last.created_at
                 ORDER BY u.created_at DESC LIMIT 1
               ) AS content
        FROM (
          SELECT DISTINCT ON (member_id) member_id, created_at
          FROM support_messages
          WHERE handoff = TRUE AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
          ORDER BY member_id, created_at DESC
        ) last
        INNER JOIN members m ON m.id = last.member_id
        WHERE m.is_platform_admin = FALSE
        ORDER BY last.created_at DESC
      `),
      postgres.query(`
        SELECT COUNT(DISTINCT member_id)::int AS members, COUNT(*)::int AS messages
        FROM support_messages
        WHERE flag IS NOT NULL AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      `),
      countWaiting(),
    ]);

    const students = members.rows.map(serializeMember);
    const period = currentPeriod();

    res.json({
      totals: {
        students: students.length,
        essencial: students.filter((student) => student.plan === "essencial").length,
        premium: students.filter((student) => student.plan === "premium").length,
        plansPending: students.filter((student) => student.pendingPlan).length,
        anamneseMissing: students.filter((student) => student.anamneseStatus !== "submitted").length,
        checkinsThisMonth: students.filter((student) => student.lastCheckin?.period === period).length,
      },
      // Fila de trabalho: planos esperando revisão, do mais antigo para o mais novo.
      pendingPlans: students
        .filter((student) => student.pendingPlan)
        .sort(
          (a, b) =>
            new Date(a.pendingPlan.requestedAt).getTime() - new Date(b.pendingPlan.requestedAt).getTime(),
        ),
      supportWaiting: waiting.rows.map((row) => ({
        memberId: row.member_id,
        name: row.name,
        content: row.content || "",
        createdAt: row.created_at,
      })),
      upcomingEvents: events.rows.map((event) => serializeEvent(event)),
      // Uso indevido do suporte nos últimos 7 dias.
      supportFlagged: flagged.rows[0],
      // Clientes esperando alguém da equipe assumir o atendimento pelo chat.
      supportQueue,
      // Acessos externos que pararam de tentar e precisam de alguém olhar.
      externalFailed: await countFailedAccounts(),
      agentConfigured: isAgentConfigured(),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar a visão geral.");
  }
});

// ---------------------------------------------------------------------------
// Alunos
// ---------------------------------------------------------------------------

router.get("/members", async (_req, res) => {
  try {
    const [result, delivery] = await Promise.all([
      postgres.query(`${MEMBERS_WITH_PROGRESS} ORDER BY m.name ASC`),
      getDeliverySummaries(),
    ]);
    res.json({
      members: result.rows.map((row) => ({ ...serializeMember(row), delivery: delivery.get(row.id) || null })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os alunos.");
  }
});

// Cadastro pela equipe (o caminho normal é a compra na Hubla). Sem senha, o
// aluno recebe o e-mail de boas-vindas para criar a dele.
router.post("/members", async (req, res) => {
  try {
    const name = readText(req.body?.name, { field: "name", label: "o nome", max: 255, required: true });
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      throw new ValidationError("Informe um e-mail válido.", "email");
    }
    if (!isValidPlan(req.body?.plan)) {
      throw new ValidationError("Escolha o plano do aluno.", "plan");
    }
    if (password && password.length < 8) {
      throw new ValidationError("A senha deve ter pelo menos 8 caracteres.", "password");
    }

    const purchaseDate = readDate(req.body?.purchaseDate, { field: "purchaseDate", label: "Data da compra" });
    const phone = readOptionalPhone(req.body?.phone);
    const document = readOptionalDocument(req.body?.document);

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = await postgres.query(
      `
        INSERT INTO members (id, name, email, password_hash, avatar_color, plan, purchase_date, phone, document, crm_enabled)
        VALUES ($1, $2, $3, $4, 'bg-emerald-600', $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO NOTHING
        RETURNING *
      `,
      [
        createId("user"),
        name,
        email,
        passwordHash,
        normalizePlan(req.body.plan),
        purchaseDate,
        phone,
        document,
        await crmEnabledForNew(),
      ],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: "Já existe um acesso com esse e-mail.", field: "email" });
    }

    syncMemberSafely(result.rows[0].id);
    syncMemberTicketsSafely(result.rows[0].id);
    const emailSent = passwordHash ? false : await sendWelcome(result.rows[0]);
    // O guia dos primeiros passos sai também quando a equipe já definiu a senha.
    await sendGuideOnceSafely(result.rows[0]);
    res.status(201).json({
      message: passwordHash
        ? "Aluno criado."
        : emailSent
          ? "Aluno criado. E-mail para criar a senha enviado."
          : "Aluno criado, mas o e-mail não saiu. Reenvie pela página do aluno.",
      member: serializeMember(await findStudent(result.rows[0].id)),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível criar o aluno.");
  }
});

// Tudo de um aluno em uma chamada.
router.get("/members/:id", async (req, res) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    const [diagnostic, plans, checkins, messages, products] = await Promise.all([
      postgres.query("SELECT * FROM diagnostics WHERE member_id = $1", [student.id]),
      postgres.query("SELECT * FROM plans WHERE member_id = $1 ORDER BY cycle DESC", [student.id]),
      postgres.query("SELECT * FROM checkins WHERE member_id = $1 ORDER BY period DESC LIMIT 12", [
        student.id,
      ]),
      postgres.query(
        "SELECT * FROM support_messages WHERE member_id = $1 ORDER BY created_at ASC LIMIT 200",
        [student.id],
      ),
      postgres.query(
        `
          SELECT p.id, p.name, p.plan, p.access_url AS default_url, p.internal_page,
                 a.access_url, a.note
          FROM products p
          LEFT JOIN member_product_access a ON a.product_id = p.id AND a.member_id = $1
          WHERE p.is_active = TRUE
          ORDER BY p.sort_order ASC
        `,
        [student.id],
      ),
    ]);

    res.json({
      member: serializeMember(student),
      questions: QUESTIONS,
      diagnostic: serializeDiagnostic(diagnostic.rows[0]),
      plans: plans.rows.map((plan) => ({
        id: plan.id,
        cycle: plan.cycle,
        status: plan.status,
        requestedAt: plan.requested_at,
        approvedAt: plan.approved_at,
      })),
      checkins: checkins.rows.map(serializeCheckin),
      messages: messages.rows.map(serializeMessage),
      // Acessos criados automaticamente nas plataformas externas.
      externalAccounts: await getMemberAccounts(student.id),
      // Entregáveis que abrem link: o individual do aluno vence o geral.
      accesses: products.rows
        .filter((product) => !product.internal_page)
        .map((product) => ({
          productId: product.id,
          productName: product.name,
          plan: normalizePlan(product.plan),
          defaultUrl: product.default_url || null,
          accessUrl: product.access_url || null,
          note: product.note || null,
        })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o aluno.");
  }
});

// Body: { name?, plan?, accessStatus?: "active" | "suspended" }
router.patch("/members/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const name =
      body.name === undefined
        ? null
        : readText(body.name, { field: "name", label: "o nome", max: 255, required: true });
    if (body.plan !== undefined && !isValidPlan(body.plan)) {
      throw new ValidationError("Plano inválido.", "plan");
    }
    if (body.accessStatus !== undefined && !["active", "suspended"].includes(body.accessStatus)) {
      throw new ValidationError("Situação de acesso inválida.", "accessStatus");
    }

    // phone: ausente = não mexe; "" ou null = apaga.
    const changesPhone = body.phone !== undefined;
    const phone = changesPhone ? readOptionalPhone(body.phone) : null;
    // document: ausente = não mexe; "" ou null = apaga.
    const changesDocument = body.document !== undefined;
    const document = changesDocument ? readOptionalDocument(body.document) : null;

    // purchaseDate: ausente = não mexe; "" ou null = apaga a data.
    const changesPurchase = body.purchaseDate !== undefined;
    const purchaseDate = changesPurchase
      ? readDate(body.purchaseDate, { field: "purchaseDate", label: "Data da compra" })
      : null;

    // crmEnabled: ausente = não mexe. Override por aluno da integração do CRM.
    const changesCrm = body.crmEnabled !== undefined;
    const crmEnabled = Boolean(body.crmEnabled);

    const result = await postgres.query(
      `
        UPDATE members
        SET name = COALESCE($1, name),
            plan = COALESCE($2, plan),
            plan_status = COALESCE($3, plan_status),
            purchase_date = CASE WHEN $5::boolean THEN $6::date ELSE purchase_date END,
            phone = CASE WHEN $7::boolean THEN $8 ELSE phone END,
            document = CASE WHEN $9::boolean THEN $10 ELSE document END,
            crm_enabled = CASE WHEN $11::boolean THEN $12::boolean ELSE crm_enabled END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND is_platform_admin = FALSE
        RETURNING id
      `,
      [
        name,
        body.plan === undefined ? null : normalizePlan(body.plan),
        body.accessStatus === undefined ? null : body.accessStatus,
        req.params.id,
        changesPurchase,
        purchaseDate,
        changesPhone,
        phone,
        changesDocument,
        document,
        changesCrm,
        crmEnabled,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }
    // Plano, situação ou data mudaram: as plataformas externas acompanham.
    syncMemberSafely(req.params.id);
    syncMemberTicketsSafely(req.params.id);
    res.json({ message: "Aluno atualizado.", member: serializeMember(await findStudent(req.params.id)) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar o aluno.");
  }
});

// A equipe preenche/edita os Indicadores do Negócio (q31..q36) do aluno, quando
// ele deixou em branco na anamnese ou depois de uma call de hot seat.
// Body: { answers: { q31: "...", q33: "Não sei informar", ... } }
router.patch("/members/:id/indicadores", async (req, res) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }
    const diagnostic = await saveMemberIndicators(req.params.id, req.body?.answers);
    res.json({ message: "Indicadores atualizados.", diagnostic });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar os indicadores.");
  }
});

// Pede de novo os acessos nas plataformas externas (depois de uma falha).
router.post("/members/:id/external-accounts/retry", async (req, res) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }
    await postgres.query(
      `
        UPDATE external_accounts
        SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = CURRENT_TIMESTAMP
        WHERE member_id = $1 AND status <> 'ok'
      `,
      [student.id],
    );
    await syncMemberSafely(student.id);
    res.json({ message: "Acessos pedidos de novo.", externalAccounts: await getMemberAccounts(student.id) });
  } catch (error) {
    sendError(res, error, "Não foi possível pedir os acessos de novo.");
  }
});

// Entrega: e-mails enviados ao aluno (saiu, falhou, foi aberto) e sinais de acesso.
router.get("/members/:id/delivery", async (req, res) => {
  try {
    await ensureSchema();
    res.json(await getMemberDelivery(req.params.id));
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os envios do aluno.");
  }
});

// E-mails automáticos que a equipe pode mandar de novo para o aluno.
router.get("/members/:id/emails", async (req, res) => {
  try {
    await ensureSchema();
    res.json({ emails: await listMemberEmails(req.params.id) });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os e-mails do aluno.");
  }
});

// Body: { key }. Manda agora o mesmo e-mail que a plataforma manda sozinha.
router.post("/members/:id/emails", async (req, res) => {
  try {
    await ensureSchema();
    res.json({ message: await sendMemberEmail(req.params.id, req.body?.key) });
  } catch (error) {
    sendError(res, error, "Não foi possível enviar o e-mail.");
  }
});

// Reenvia o e-mail com o link para criar a senha.
router.post("/members/:id/resend-access", async (req, res) => {
  try {
    const result = await postgres.query(
      "SELECT * FROM members WHERE id = $1 AND is_platform_admin = FALSE",
      [req.params.id],
    );
    const member = result.rows[0];
    if (!member) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    const sent = await sendWelcome(member);
    if (!sent) {
      return res.status(502).json({ message: "O e-mail não saiu. Tente novamente em instantes." });
    }
    res.json({ message: `E-mail de acesso enviado para ${member.email}.` });
  } catch (error) {
    sendError(res, error, "Não foi possível reenviar o e-mail.");
  }
});


// ---------------------------------------------------------------------------
// Planos: fila de revisão, editor e aprovação
// ---------------------------------------------------------------------------

async function findPlan(planId) {
  const result = await postgres.query(
    `
      SELECT p.*, m.name AS member_name, m.email AS member_email, m.plan AS member_plan
      FROM plans p
      INNER JOIN members m ON m.id = p.member_id
      WHERE p.id = $1
    `,
    [planId],
  );
  return result.rows[0] || null;
}

function planMember(row) {
  const plan = normalizePlan(row.member_plan);
  return { id: row.member_id, name: row.member_name, email: row.member_email, plan, planName: PLANS[plan].name };
}

router.get("/plans", async (_req, res) => {
  try {
    const result = await postgres.query(`
      SELECT p.id, p.cycle, p.status, p.source, p.draft_status, p.requested_at, p.approved_at, p.member_id,
             m.name AS member_name, m.email AS member_email, m.plan AS member_plan
      FROM plans p
      INNER JOIN members m ON m.id = p.member_id
      ORDER BY (p.status = 'pending') DESC, p.requested_at ASC
    `);

    res.json({
      plans: result.rows.map((row) => ({
        id: row.id,
        cycle: row.cycle,
        status: row.status,
        source: row.source,
        draftStatus: row.draft_status || "none",
        requestedAt: row.requested_at,
        dueAt: reviewDueAt(row.requested_at),
        approvedAt: row.approved_at,
        member: planMember(row),
      })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os planos.");
  }
});

// Tudo que a revisão precisa: o plano, as respostas da anamnese e, a partir do
// segundo ciclo, o que o aluno fez no plano anterior e nos check-ins.
router.get("/plans/:planId", async (req, res) => {
  try {
    const row = await findPlan(req.params.planId);
    if (!row) {
      return res.status(404).json({ message: "Plano não encontrado." });
    }

    const [diagnostic, previous, checkins] = await Promise.all([
      postgres.query("SELECT * FROM diagnostics WHERE member_id = $1", [row.member_id]),
      postgres.query(
        "SELECT * FROM plans WHERE member_id = $1 AND cycle < $2 ORDER BY cycle DESC LIMIT 1",
        [row.member_id, row.cycle],
      ),
      postgres.query("SELECT * FROM checkins WHERE member_id = $1 ORDER BY period DESC LIMIT 6", [
        row.member_id,
      ]),
    ]);

    const plan = serializePlan(row);
    const previousRow = previous.rows[0] || null;

    res.json({
      plan,
      member: planMember(row),
      questions: QUESTIONS,
      answers: diagnostic.rows[0]?.answers || {},
      // O que o agente escreveu para quem revisa (não aparece para o cliente).
      agentNotes: row.agent_notes || null,
      agentConfigured: isAgentConfigured(),
      // Leitura de maturidade calculada pela Matriz a partir das respostas.
      maturity: computeMaturity(diagnostic.rows[0]?.answers || {}),
      previous: previousRow
        ? { plan: serializePlan(previousRow), progress: await getProgress(postgres, previousRow.id) }
        : null,
      checkins: checkins.rows.map(serializeCheckin),
      // O que ainda impede a aprovação, para o editor mostrar antes de tentar.
      errors: approveErrors(plan.content, row.member_plan),
      catalog: { ceo: FORMACAO_EXECUTIVA, academy: ACADEMY_COURSES },
      pillars: PILLARS,
      stages: STAGES,
      maxActions: MAX_ACTIONS,
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o plano.");
  }
});

// Salva o texto do plano. Body: { content }
router.put("/plans/:planId", async (req, res) => {
  try {
    const row = await findPlan(req.params.planId);
    if (!row) {
      return res.status(404).json({ message: "Plano não encontrado." });
    }

    if (DRAFT_BUSY.includes(row.draft_status)) {
      return res.status(409).json({ message: "A IA ainda está escrevendo o rascunho. Aguarde terminar." });
    }

    const content = normalizeContent(req.body?.content);
    const errors = approveErrors(content, row.member_plan);

    // Plano já liberado continua editável, mas o aluno nunca pode ver um
    // documento que não passaria na aprovação.
    if (row.status === "approved" && errors.length > 0) {
      return res.status(422).json({
        message: "Este plano já está liberado: corrija os pontos abaixo para salvar.",
        errors,
      });
    }

    const result = await postgres.query(
      "UPDATE plans SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [JSON.stringify(content), row.id],
    );
    res.json({ message: "Plano salvo.", plan: serializePlan(result.rows[0]), errors });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o plano.");
  }
});

// Aprova e libera para o aluno. Só passa se cumprir as regras da metodologia.
router.post("/plans/:planId/approve", async (req, res) => {
  try {
    const row = await findPlan(req.params.planId);
    if (!row) {
      return res.status(404).json({ message: "Plano não encontrado." });
    }

    if (DRAFT_BUSY.includes(row.draft_status)) {
      return res.status(409).json({ message: "A IA ainda está escrevendo o rascunho. Aguarde terminar." });
    }

    const errors = approveErrors(normalizeContent(row.content), row.member_plan);
    if (errors.length > 0) {
      return res.status(422).json({ message: "O plano ainda não pode ser liberado.", errors });
    }

    const result = await postgres.query(
      `
        UPDATE plans
        SET status = 'approved',
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
            approved_by = COALESCE(approved_by, $1),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `,
      [req.user.id, row.id],
    );
    // Aviso ao aluno de que o plano foi liberado; não segura a resposta nem
    // falha a liberação se o e-mail não sair. Só no primeiro envio deste ciclo.
    if (!row.seen_at && !row.approved_at) {
      sendPlanReadyEmail({
        to: row.member_email,
        name: row.member_name,
        firstCycle: row.cycle === 1,
        track: { memberId: row.member_id, kind: "plan_ready" },
      }).catch((error) => console.error("[plano] falha ao avisar o aluno", error?.message || error));
    }

    res.json({ message: "Plano liberado para o aluno.", plan: serializePlan(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível liberar o plano.");
  }
});

// Pede um novo rascunho à IA, com uma orientação opcional da equipe. O texto
// atual do plano é substituído quando o rascunho ficar pronto.
// Body: { instructions?: string }
router.post("/plans/:planId/regenerate", async (req, res) => {
  try {
    const instructions = readText(req.body?.instructions, {
      field: "instructions",
      label: "A orientação",
      max: 2000,
    });

    if (!isAgentConfigured()) {
      return res.status(409).json({ message: "A IA ainda não está ligada neste ambiente." });
    }

    const result = await postgres.query(
      `
        UPDATE plans
        SET draft_status = 'queued', draft_instructions = $1, draft_error = NULL
        WHERE id = $2 AND status = 'pending' AND draft_status NOT IN ('queued', 'generating')
        RETURNING id
      `,
      [instructions, req.params.planId],
    );
    if (result.rows.length === 0) {
      return res.status(409).json({
        message: "Só dá para pedir novo rascunho de um plano em revisão que não esteja sendo gerado.",
      });
    }

    startQueuedDrafts();
    res.json({ message: "Novo rascunho pedido à IA. Leva alguns minutos." });
  } catch (error) {
    sendError(res, error, "Não foi possível pedir o novo rascunho.");
  }
});

// Abre um novo ciclo para o aluno, sem esperar ele pedir.
router.post("/members/:id/plans", async (req, res) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }
    if (student.diagnostic_status !== "submitted") {
      return res.status(409).json({ message: "O aluno ainda não enviou a anamnese." });
    }
    if (student.pending_plan_id) {
      return res.status(409).json({ message: "Já existe um plano em revisão para este aluno." });
    }

    const plan = await createPendingPlan(postgres, student.id);
    startQueuedDrafts();
    res.status(201).json({ message: "Novo ciclo aberto.", plan: { id: plan.id, cycle: plan.cycle } });
  } catch (error) {
    sendError(res, error, "Não foi possível abrir o novo ciclo.");
  }
});

// ---------------------------------------------------------------------------
// Atividades práticas (publicadas por plano, iguais para todos do plano)
// ---------------------------------------------------------------------------

router.get("/activities", async (_req, res) => {
  try {
    const result = await postgres.query(`
      SELECT a.*,
             (SELECT COUNT(*) FROM activity_progress p WHERE p.activity_id = a.id)::int AS done_count,
             (
               SELECT COUNT(*) FROM members m
               WHERE m.is_platform_admin = FALSE AND (a.audience = 'all' OR m.plan = a.audience)
             )::int AS audience_count
      FROM activities a
      ORDER BY a.published_at DESC
    `);

    res.json({
      activities: result.rows.map((row) => ({
        ...serializeActivity({ ...row, completed_at: null }),
        doneCount: row.done_count,
        audienceCount: row.audience_count,
      })),
      audiences: Object.entries(ACTIVITY_AUDIENCES).map(([id, label]) => ({ id, label })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar as atividades.");
  }
});

router.post("/activities", async (req, res) => {
  try {
    const input = readActivityInput(req.body);
    const result = await postgres.query(
      `
        INSERT INTO activities (id, audience, title, description, due_date, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [createId("activity"), input.audience, input.title, input.description, input.dueDate, req.user.id],
    );
    res.status(201).json({ activity: serializeActivity(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível publicar a atividade.");
  }
});

router.patch("/activities/:activityId", async (req, res) => {
  try {
    const input = readActivityInput(req.body);
    const result = await postgres.query(
      `
        UPDATE activities SET audience = $1, title = $2, description = $3, due_date = $4
        WHERE id = $5
        RETURNING *
      `,
      [input.audience, input.title, input.description, input.dueDate, req.params.activityId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Atividade não encontrada." });
    }
    res.json({ activity: serializeActivity(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar a atividade.");
  }
});

router.delete("/activities/:activityId", async (req, res) => {
  try {
    const result = await postgres.query("DELETE FROM activities WHERE id = $1 RETURNING id", [
      req.params.activityId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Atividade não encontrada." });
    }
    res.json({ message: "Atividade excluída." });
  } catch (error) {
    sendError(res, error, "Não foi possível excluir a atividade.");
  }
});

// ---------------------------------------------------------------------------
// Ingressos dos eventos presenciais (leitura do QR code na entrada)
// ---------------------------------------------------------------------------

// Ingressos emitidos de um evento, com as entradas já registradas.
router.get("/events/:eventId/tickets", async (req, res) => {
  try {
    res.json({ tickets: await listEventTickets(req.params.eventId) });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os ingressos.");
  }
});

// Situação do ingresso neste momento: vale se a assinatura estiver ativa agora.
router.get("/event-tickets/:code", async (req, res) => {
  try {
    res.json({ ticket: await readTicketByCode(req.params.code) });
  } catch (error) {
    sendError(res, error, "Não foi possível ler o ingresso.");
  }
});

router.post("/event-tickets/:code/checkin", async (req, res) => {
  try {
    const ticket = await checkInTicket(req.params.code, req.user.id);
    res.status(201).json({ message: "Entrada registrada.", ticket });
  } catch (error) {
    sendError(res, error, "Não foi possível registrar a entrada.");
  }
});

// ---------------------------------------------------------------------------
// Ferramentas e modelos (planilhas, checklists e roteiros para baixar)
// ---------------------------------------------------------------------------

router.get("/tools", async (_req, res) => {
  try {
    const result = await postgres.query("SELECT * FROM tools ORDER BY category ASC, title ASC");
    res.json({
      tools: result.rows.map(serializeTool),
      categories: Object.entries(TOOL_CATEGORIES).map(([id, label]) => ({ id, label })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar as ferramentas.");
  }
});

router.post("/tools", async (req, res) => {
  try {
    const input = readToolInput(req.body);
    const result = await postgres.query(
      `
        INSERT INTO tools (id, title, description, url, category, plan, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [createId("tool"), input.title, input.description, input.url, input.category, input.plan, input.active],
    );
    res.status(201).json({ message: "Material publicado.", tool: serializeTool(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o material.");
  }
});

router.patch("/tools/:toolId", async (req, res) => {
  try {
    const input = readToolInput(req.body);
    const result = await postgres.query(
      `
        UPDATE tools
        SET title = $1, description = $2, url = $3, category = $4, plan = $5, active = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING *
      `,
      [input.title, input.description, input.url, input.category, input.plan, input.active, req.params.toolId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Material não encontrado." });
    }
    res.json({ message: "Material atualizado.", tool: serializeTool(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar o material.");
  }
});

router.delete("/tools/:toolId", async (req, res) => {
  try {
    const result = await postgres.query("DELETE FROM tools WHERE id = $1 RETURNING id", [req.params.toolId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Material não encontrado." });
    }
    res.json({ message: "Material excluído." });
  } catch (error) {
    sendError(res, error, "Não foi possível excluir o material.");
  }
});

// ---------------------------------------------------------------------------
// Atendimento humano pelo chat (fila, quem assumiu, finalizados)
// ---------------------------------------------------------------------------

router.get("/tickets", async (req, res) => {
  try {
    res.json(await listTicketsForAdmin(req.user.id));
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os atendimentos.");
  }
});

// Conversa de um atendimento. Em andamento com outra pessoa: 403.
router.get("/tickets/:ticketId", async (req, res) => {
  try {
    const { ticket, context, messages } = await readTicketForAdmin(req.params.ticketId, req.user.id);
    res.json({
      ticket: serializeTicket(ticket),
      context: context.map(serializeMessage),
      messages: messages.map(serializeMessage),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o atendimento.");
  }
});

// Assume o atendimento: só o primeiro consegue.
router.post("/tickets/:ticketId/claim", async (req, res) => {
  try {
    const ticket = await claimTicket(req.params.ticketId, req.user);
    res.json({ message: "Atendimento assumido.", ticket: serializeTicket(ticket) });
  } catch (error) {
    sendError(res, error, "Não foi possível assumir o atendimento.");
  }
});

// Body: { content }. Só quem assumiu responde.
router.post("/tickets/:ticketId/messages", async (req, res) => {
  try {
    const content = readText(req.body?.content, {
      field: "content",
      label: "a resposta",
      max: 2000,
      required: true,
    });
    const message = await addTeamMessage(req.params.ticketId, req.user.id, content);
    res.status(201).json({ message: serializeMessage(message) });
  } catch (error) {
    sendError(res, error, "Não foi possível enviar a resposta.");
  }
});

// Devolve para a fila, para outra pessoa assumir.
router.post("/tickets/:ticketId/release", async (req, res) => {
  try {
    await releaseTicket(req.params.ticketId, req.user.id);
    res.json({ message: "Atendimento devolvido para a fila." });
  } catch (error) {
    sendError(res, error, "Não foi possível devolver o atendimento.");
  }
});

router.post("/tickets/:ticketId/close", async (req, res) => {
  try {
    await closeTicket(req.params.ticketId, req.user.id);
    res.json({ message: "Atendimento finalizado." });
  } catch (error) {
    sendError(res, error, "Não foi possível finalizar o atendimento.");
  }
});

// ---------------------------------------------------------------------------
// Configurações e consumo da IA
// ---------------------------------------------------------------------------

router.get("/settings", async (_req, res) => {
  try {
    res.json({ settings: await getSettings() });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar as configurações.");
  }
});

// Body: { supportWhatsapp, supportStart, supportEnd, supportDays, supportIdleMinutes, supportAlertEmail }
router.put("/settings", async (req, res) => {
  try {
    const settings = await saveSettings(readSettingsInput(req.body));
    res.json({ message: "Configurações salvas.", settings });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar as configurações.");
  }
});

// Consumo da API da IA por mês e por tipo de uso, com custo estimado em dólar.
router.get("/ai-usage", async (_req, res) => {
  try {
    const students = await postgres.query(
      "SELECT COUNT(*)::int AS total FROM members WHERE is_platform_admin = FALSE",
    );
    res.json({
      months: await readUsageSummary(),
      students: students.rows[0].total,
      agentConfigured: isAgentConfigured(),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o consumo da IA.");
  }
});

// ---------------------------------------------------------------------------
// Uso indevido do suporte (mensagens marcadas pela IA)
// ---------------------------------------------------------------------------

// Query: days (1 a 365, padrão 30), category e memberId opcionais.
router.get("/support/flags", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 30, 1), 365);
    const category = SUPPORT_FLAGS[req.query.category] ? req.query.category : null;
    const memberId = req.query.memberId ? String(req.query.memberId) : null;

    const [occurrences, members] = await Promise.all([
      postgres.query(
        `
          SELECT s.id, s.member_id, s.flag, s.content, s.created_at, m.name, m.email, m.plan,
                 (
                   SELECT r.content FROM support_messages r
                   WHERE r.member_id = s.member_id AND r.role = 'assistant' AND r.created_at >= s.created_at
                   ORDER BY r.created_at ASC LIMIT 1
                 ) AS reply
          FROM support_messages s
          INNER JOIN members m ON m.id = s.member_id
          WHERE s.flag IS NOT NULL
            AND s.created_at > CURRENT_TIMESTAMP - make_interval(days => $1)
            AND ($2::varchar IS NULL OR s.flag = $2::varchar)
            AND ($3::varchar IS NULL OR s.member_id = $3::varchar)
          ORDER BY s.created_at DESC
          LIMIT 300
        `,
        [days, category, memberId],
      ),
      // Quem mais aparece no período, sem os filtros de categoria e de aluno.
      postgres.query(
        `
          SELECT s.member_id, m.name, m.email, m.plan,
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE s.flag = ANY($2))::int AS severe,
                 MAX(s.created_at) AS last_at
          FROM support_messages s
          INNER JOIN members m ON m.id = s.member_id
          WHERE s.flag IS NOT NULL AND s.created_at > CURRENT_TIMESTAMP - make_interval(days => $1)
          GROUP BY s.member_id, m.name, m.email, m.plan
          ORDER BY severe DESC, total DESC, last_at DESC
        `,
        [days, Object.keys(SUPPORT_FLAGS).filter((key) => SUPPORT_FLAGS[key].severe)],
      ),
    ]);

    res.json({
      days,
      categories: Object.entries(SUPPORT_FLAGS).map(([id, flag]) => ({ id, ...flag })),
      occurrences: occurrences.rows.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        name: row.name,
        email: row.email,
        plan: normalizePlan(row.plan),
        category: row.flag,
        content: row.content,
        reply: row.reply || null,
        createdAt: row.created_at,
      })),
      members: members.rows.map((row) => ({
        memberId: row.member_id,
        name: row.name,
        email: row.email,
        plan: normalizePlan(row.plan),
        total: row.total,
        severe: row.severe,
        lastAt: row.last_at,
      })),
      agentConfigured: isAgentConfigured(),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o uso do suporte.");
  }
});

// A equipe leu e não considera uso indevido: tira a marca.
router.delete("/support/flags/:messageId", async (req, res) => {
  try {
    const result = await postgres.query(
      "UPDATE support_messages SET flag = NULL WHERE id = $1 AND flag IS NOT NULL RETURNING id",
      [req.params.messageId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ocorrência não encontrada." });
    }
    res.json({ message: "Ocorrência removida." });
  } catch (error) {
    sendError(res, error, "Não foi possível remover a ocorrência.");
  }
});

// ---------------------------------------------------------------------------
// Aprendizado: relatório semanal das conversas e sugestões de artigo
// ---------------------------------------------------------------------------

router.get("/insights", async (_req, res) => {
  try {
    const result = await postgres.query("SELECT * FROM support_insights ORDER BY created_at DESC LIMIT 12");
    res.json({
      insights: result.rows.map(serializeInsight),
      audiences: Object.entries(KNOWLEDGE_AUDIENCES).map(([id, label]) => ({ id, label })),
      weekDays: WEEK_DAYS,
      agentConfigured: isAgentConfigured(),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os relatórios.");
  }
});

// Gera agora o relatório dos últimos 7 dias, sem esperar a rodada semanal.
router.post("/insights/generate", async (_req, res) => {
  try {
    if (!isAgentConfigured()) {
      return res.status(409).json({ message: "A IA não está ligada neste ambiente." });
    }
    const to = new Date();
    const from = new Date(to.getTime() - WEEK_DAYS * 24 * 60 * 60 * 1000);
    const id = await startInsight({ from, to });
    if (!id) {
      return res.status(409).json({ message: "Já existe um relatório sendo gerado. Aguarde alguns minutos." });
    }
    res.status(202).json({ message: "Relatório pedido à IA. Leva alguns minutos.", id });
  } catch (error) {
    sendError(res, error, "Não foi possível pedir o relatório.");
  }
});

// Body: { action: "approve", title, content, audience } ou { action: "dismiss" }.
// Aprovar cria o artigo na base de conhecimento, já ativo.
router.post("/insights/:insightId/suggestions/:suggestionId", async (req, res) => {
  try {
    const found = await postgres.query("SELECT * FROM support_insights WHERE id = $1", [req.params.insightId]);
    const insight = found.rows[0];
    const suggestion = insight?.report?.suggestions?.find((item) => item.id === req.params.suggestionId);
    if (!suggestion) {
      return res.status(404).json({ message: "Sugestão não encontrada." });
    }
    if (suggestion.status !== "pending") {
      return res.status(409).json({ message: "Esta sugestão já foi tratada." });
    }

    if (req.body?.action === "dismiss") {
      suggestion.status = "dismissed";
    } else if (req.body?.action === "approve") {
      const input = readKnowledgeInput({ ...req.body, kind: "content", active: true });
      if (/\[PREENCHER/i.test(input.content)) {
        throw new ValidationError(
          "O texto ainda tem trechos marcados com [PREENCHER]. Complete ou apague antes de aprovar.",
          "content",
        );
      }
      await assertFits(input, null);
      const created = await postgres.query(
        `
          INSERT INTO knowledge_articles (id, kind, title, content, audience, active, created_by)
          VALUES ($1, 'content', $2, $3, $4, TRUE, $5)
          RETURNING id
        `,
        [createId("kb"), input.title, input.content, input.audience, req.user.id],
      );
      suggestion.status = "approved";
      suggestion.articleId = created.rows[0].id;
    } else {
      return res.status(400).json({ message: "Ação inválida." });
    }

    await postgres.query("UPDATE support_insights SET report = $1 WHERE id = $2", [
      JSON.stringify(insight.report),
      insight.id,
    ]);
    res.json({
      message: suggestion.status === "approved" ? "Artigo criado. A IA já usa este conteúdo." : "Sugestão descartada.",
    });
  } catch (error) {
    sendError(res, error, "Não foi possível tratar a sugestão.");
  }
});

// ---------------------------------------------------------------------------
// Base de conhecimento do assistente de suporte
// ---------------------------------------------------------------------------

router.get("/knowledge", async (_req, res) => {
  try {
    // Regras de conduta primeiro: são o que a equipe mais precisa enxergar.
    const result = await postgres.query(
      "SELECT * FROM knowledge_articles ORDER BY (kind = 'rules') DESC, created_at ASC, id ASC",
    );
    const articles = result.rows.map(serializeArticle);
    res.json({
      articles,
      audiences: Object.entries(KNOWLEDGE_AUDIENCES).map(([id, label]) => ({ id, label })),
      kinds: Object.entries(KNOWLEDGE_KINDS).map(([id, label]) => ({ id, label })),
      activeChars: articles.filter((article) => article.active).reduce((sum, article) => sum + article.chars, 0),
      limits: { article: ARTICLE_MAX_CHARS, total: TOTAL_MAX_CHARS },
      agentConfigured: isAgentConfigured(),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar a base de conhecimento.");
  }
});

router.post("/knowledge", async (req, res) => {
  try {
    const input = readKnowledgeInput(req.body);
    await assertFits(input, null);
    const result = await postgres.query(
      `
        INSERT INTO knowledge_articles (id, kind, title, content, audience, active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [createId("kb"), input.kind, input.title, input.content, input.audience, input.active, req.user.id],
    );
    res.status(201).json({ article: serializeArticle(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o artigo.");
  }
});

router.patch("/knowledge/:articleId", async (req, res) => {
  try {
    const input = readKnowledgeInput(req.body);
    await assertFits(input, req.params.articleId);
    const result = await postgres.query(
      `
        UPDATE knowledge_articles
        SET title = $1, content = $2, audience = $3, active = $4, kind = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `,
      [input.title, input.content, input.audience, input.active, input.kind, req.params.articleId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artigo não encontrado." });
    }
    res.json({ article: serializeArticle(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar o artigo.");
  }
});

router.delete("/knowledge/:articleId", async (req, res) => {
  try {
    const result = await postgres.query("DELETE FROM knowledge_articles WHERE id = $1 RETURNING id", [
      req.params.articleId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artigo não encontrado." });
    }
    res.json({ message: "Artigo excluído." });
  } catch (error) {
    sendError(res, error, "Não foi possível excluir o artigo.");
  }
});

// ---------------------------------------------------------------------------
// Acesso individual a um entregável (ex.: ingresso do Evento Anual)
// ---------------------------------------------------------------------------

// Body: { accessUrl?: string, note?: string } — os dois vazios removem o acesso individual.
router.put("/members/:id/access/:productId", async (req, res) => {
  try {
    const accessUrl = readUrl(req.body?.accessUrl, { field: "accessUrl", label: "Link" });
    const note = readText(req.body?.note, { field: "note", label: "A observação", max: 1000 });

    const [student, product] = await Promise.all([
      findStudent(req.params.id),
      postgres.query("SELECT id FROM products WHERE id = $1 AND is_active = TRUE", [
        req.params.productId,
      ]),
    ]);
    if (!student || product.rows.length === 0) {
      return res.status(404).json({ message: "Aluno ou entregável não encontrado." });
    }

    if (!accessUrl && !note) {
      await postgres.query(
        "DELETE FROM member_product_access WHERE member_id = $1 AND product_id = $2",
        [student.id, req.params.productId],
      );
      return res.json({ message: "Acesso individual removido.", accessUrl: null, note: null });
    }

    await postgres.query(
      `
        INSERT INTO member_product_access (member_id, product_id, access_url, note)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (member_id, product_id) DO UPDATE SET
          access_url = EXCLUDED.access_url,
          note = EXCLUDED.note,
          updated_at = CURRENT_TIMESTAMP
      `,
      [student.id, req.params.productId, accessUrl, note],
    );

    res.json({ message: "Acesso individual salvo.", accessUrl, note });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o acesso.");
  }
});

// ---------------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------------

router.get("/events", async (_req, res) => {
  try {
    const result = await postgres.query("SELECT * FROM events ORDER BY starts_at ASC");
    res.json({
      events: result.rows.map((event) => serializeEvent(event)),
      types: Object.entries(EVENT_TYPES).map(([id, label]) => ({ id, label })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o calendário.");
  }
});

router.post("/events", async (req, res) => {
  try {
    const input = readEventInput(req.body);
    const result = await postgres.query(
      `
        INSERT INTO events (id, type, plan, title, description, starts_at, ends_at, location, meeting_url, recording_url, created_by, ticketed, ticket_window_start, ticket_window_end, ticket_bonus_limit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `,
      [
        createId("event"),
        input.type,
        input.plan,
        input.title,
        input.description,
        input.startsAt,
        input.endsAt,
        input.location,
        input.meetingUrl,
        input.recordingUrl,
        req.user.id,
        input.ticketed,
        input.ticketed ? input.ticketWindowStart : null,
        input.ticketed ? input.ticketWindowEnd : null,
        input.ticketed ? input.ticketBonusLimit : null,
      ],
    );
    // Evento com ingresso: cria o evento no credenciamento e emite os ingressos.
    if (result.rows[0].ticketed) syncEventSafely(result.rows[0].id);
    res.status(201).json({ event: serializeEvent(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível criar o evento.");
  }
});

router.patch("/events/:eventId", async (req, res) => {
  try {
    const input = readEventInput(req.body);
    const result = await postgres.query(
      `
        UPDATE events
        SET type = $1, plan = $2, title = $3, description = $4, starts_at = $5, ends_at = $6,
            location = $7, meeting_url = $8, recording_url = $9, ticketed = $11,
            ticket_window_start = $12, ticket_window_end = $13, ticket_bonus_limit = $14,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING *
      `,
      [
        input.type,
        input.plan,
        input.title,
        input.description,
        input.startsAt,
        input.endsAt,
        input.location,
        input.meetingUrl,
        input.recordingUrl,
        req.params.eventId,
        input.ticketed,
        input.ticketed ? input.ticketWindowStart : null,
        input.ticketed ? input.ticketWindowEnd : null,
        input.ticketed ? input.ticketBonusLimit : null,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Evento não encontrado." });
    }
    if (result.rows[0].ticketed) syncEventSafely(result.rows[0].id);
    res.json({ event: serializeEvent(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar o evento.");
  }
});

router.delete("/events/:eventId", async (req, res) => {
  try {
    const found = await postgres.query("SELECT id, ticketed FROM events WHERE id = $1", [req.params.eventId]);
    if (found.rows.length === 0) {
      return res.status(404).json({ message: "Evento não encontrado." });
    }

    // Excluir o evento apaga os ingressos aqui (CASCADE); antes, cancela cada um
    // no credenciamento, senão eles ficariam lá valendo. Se o credenciamento não
    // responder, a exclusão não segue, para não deixar ingresso órfão.
    if (found.rows[0].ticketed && isCredenciamentoConfigured()) {
      try {
        await blockEventTickets(req.params.eventId);
      } catch (error) {
        return res.status(502).json({
          message:
            "Não foi possível cancelar os ingressos no credenciamento agora. Tente excluir de novo em instantes.",
        });
      }
    }

    await postgres.query("DELETE FROM events WHERE id = $1", [req.params.eventId]);
    res.json({ message: "Evento excluído." });
  } catch (error) {
    sendError(res, error, "Não foi possível excluir o evento.");
  }
});

// ---------------------------------------------------------------------------
// Entregáveis: link geral de cada um (o mesmo para todos os alunos)
// ---------------------------------------------------------------------------

router.get("/products", async (_req, res) => {
  try {
    const result = await postgres.query(`
      SELECT id, name, description, plan, access_url, internal_page
      FROM products
      WHERE is_active = TRUE
      ORDER BY sort_order ASC
    `);
    res.json({
      products: result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        plan: normalizePlan(product.plan),
        accessUrl: product.access_url || null,
        // Abre uma tela da própria plataforma: não precisa de link.
        internal: Boolean(product.internal_page),
      })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os entregáveis.");
  }
});

router.patch("/products/:productId", async (req, res) => {
  try {
    const accessUrl = readUrl(req.body?.accessUrl, { field: "accessUrl", label: "Link" });
    const result = await postgres.query(
      `
        UPDATE products SET access_url = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND is_active = TRUE
        RETURNING id
      `,
      [accessUrl, req.params.productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Entregável não encontrado." });
    }
    res.json({ message: "Link salvo.", accessUrl });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o link.");
  }
});

// ---------------------------------------------------------------------------
// Hubla: histórico dos avisos recebidos
// ---------------------------------------------------------------------------

router.get("/hubla/events", async (_req, res) => {
  try {
    const result = await postgres.query(
      "SELECT * FROM hubla_events ORDER BY received_at DESC LIMIT 100",
    );
    res.json({
      configured: Boolean(String(process.env.HUBLA_WEBHOOK_TOKEN || "").trim()),
      events: result.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        email: row.email,
        plan: row.plan,
        // granted, suspended, ignored ou needs_review.
        outcome: row.outcome,
        detail: row.detail,
        raw: row.raw,
        receivedAt: row.received_at,
      })),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os avisos da Hubla.");
  }
});

// Integração do CRM: chamadas agendadas pelos clientes.
router.get("/onboarding-calls", async (_req, res) => {
  try {
    await ensureSchema();
    res.json({ calls: await listOnboardingCalls() });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os agendamentos.");
  }
});

// Body: { meetLink?, status? }. Link novo numa chamada em aberto avisa o cliente por e-mail.
router.patch("/onboarding-calls/:id", async (req, res) => {
  try {
    await ensureSchema();
    res.json({ call: await updateOnboardingCall(req.params.id, req.body) });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o agendamento.");
  }
});

// Equipe reagenda a integração para outro horário, com motivo. Body: { startsAt, reason }.
router.post("/onboarding-calls/:id/reschedule", async (req, res) => {
  try {
    await ensureSchema();
    res.json({ call: await rescheduleOnboardingCall(req.params.id, req.body) });
  } catch (error) {
    sendError(res, error, "Não foi possível reagendar.");
  }
});

// Equipe: administradores da plataforma.
router.get("/team", async (req, res) => {
  try {
    res.json(await listAdmins(req.user.id));
  } catch (error) {
    sendError(res, error, "Não foi possível carregar a equipe.");
  }
});

// Body: { name, email, permissions: [áreas] }. O novo administrador recebe o
// e-mail e o master recebe o link de primeiro acesso para mandar como quiser.
router.post("/team", async (req, res) => {
  try {
    res.status(201).json(await createAdmin(req.body, req.user.id));
  } catch (error) {
    sendError(res, error, "Não foi possível criar o administrador.");
  }
});

// Body: { name?, permissions? }.
router.patch("/team/:id", async (req, res) => {
  try {
    res.json(await updateAdmin(req.params.id, req.body, req.user.id));
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o administrador.");
  }
});

// Gera um link novo de primeiro acesso (o anterior continua valendo até expirar).
router.post("/team/:id/resend-access", async (req, res) => {
  try {
    res.json(await resendAdminAccess(req.params.id));
  } catch (error) {
    sendError(res, error, "Não foi possível reenviar o acesso.");
  }
});

router.delete("/team/:id", async (req, res) => {
  try {
    res.json({ message: await removeAdmin(req.params.id, req.user.id) });
  } catch (error) {
    sendError(res, error, "Não foi possível remover o administrador.");
  }
});

module.exports = router;
