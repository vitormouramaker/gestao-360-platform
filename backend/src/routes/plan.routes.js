const express = require("express");
const router = express.Router();
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const { ensureSchema } = require("../services/migrations.service");
const {
  PILLARS,
  STAGES,
  contentForMember,
  createPendingPlan,
  getMemberPlans,
  getProgress,
  normalizeContent,
  reviewDueAt,
  serializePlan,
  startQueuedDrafts,
} = require("../services/plan.service");
const { planIncludes } = require("../services/plans.service");
const { ValidationError, readDate, readText, sendError } = require("../services/tracking.service");

async function getMember(memberId) {
  const result = await postgres.query("SELECT id, name, plan FROM members WHERE id = $1", [memberId]);
  return result.rows[0] || null;
}

/** Todas as ações do plano foram concluídas pelo empresário? */
function isPlanFinished(content, progress) {
  return content.actions.length > 0 && content.actions.every((action) => progress[action.id]?.done);
}

// O Diagnóstico 360° e o plano que a pessoa enxerga: sempre o último ciclo
// aprovado. Plano em revisão só aparece como "em análise", com o prazo.
router.get("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const member = await getMember(req.user.id);
    if (!member) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }

    const { approved, pending } = await getMemberPlans(member.id);
    const review = pending
      ? { cycle: pending.cycle, requestedAt: pending.requested_at, dueAt: reviewDueAt(pending.requested_at) }
      : null;

    if (!approved) {
      return res.json({ plan: null, progress: {}, review, canRequestNext: false, planUnseen: false, pillars: PILLARS, stages: STAGES });
    }

    const progress = await getProgress(postgres, approved.id);
    const fullContent = normalizeContent(approved.content);

    res.json({
      plan: serializePlan(approved, { content: contentForMember(fullContent, member.plan) }),
      progress,
      review,
      // Liberado e ainda não aberto pelo aluno: o menu mostra o selo "Novo".
      planUnseen: !approved.seen_at || new Date(approved.seen_at) < new Date(approved.approved_at),
      // Plano concluído e nenhum ciclo novo em revisão: a pessoa pode pedir o próximo.
      canRequestNext:
        !pending && planIncludes(member.plan, "premium") && isPlanFinished(fullContent, progress),
      pillars: PILLARS,
      stages: STAGES,
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o seu plano.");
  }
});

// O aluno abriu o plano/diagnóstico: tira o selo "Novo". Marca o último ciclo aprovado.
router.post("/seen", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    await postgres.query(
      `
        UPDATE plans SET seen_at = CURRENT_TIMESTAMP
        WHERE member_id = $1 AND status = 'approved'
          AND (seen_at IS NULL OR seen_at < approved_at)
      `,
      [req.user.id],
    );
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Não foi possível registrar a visualização.");
  }
});

// O empresário registra em cada ação quem é o responsável, o prazo que
// assumiu e se já concluiu. Body: { responsible?, dueDate?, done? }
router.patch("/actions/:actionId", verifyToken, async (req, res) => {
  try {
    const member = await getMember(req.user.id);
    if (!member || !planIncludes(member.plan, "premium")) {
      return res.status(403).json({ code: "PLAN_REQUIRED", message: "Disponível na Assinatura Anual." });
    }

    const { approved } = await getMemberPlans(member.id);
    const action = approved
      ? normalizeContent(approved.content).actions.find((item) => item.id === req.params.actionId)
      : null;
    if (!action) {
      return res.status(404).json({ message: "Ação não encontrada no seu plano." });
    }

    const body = req.body || {};
    if (body.done !== undefined && typeof body.done !== "boolean") {
      throw new ValidationError("Informe se a ação foi concluída.", "done");
    }

    const current = (await getProgress(postgres, approved.id))[action.id] || {};
    const responsible =
      body.responsible === undefined
        ? current.responsible || null
        : readText(body.responsible, { field: "responsible", label: "O responsável", max: 255 });
    const dueDate =
      body.dueDate === undefined
        ? current.dueDate || null
        : readDate(body.dueDate, { field: "dueDate", label: "Prazo" });
    const done = body.done === undefined ? Boolean(current.done) : body.done;

    await postgres.query(
      `
        INSERT INTO plan_action_progress (plan_id, action_id, responsible, due_date, completed_at)
        VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (plan_id, action_id) DO UPDATE SET
          responsible = EXCLUDED.responsible,
          due_date = EXCLUDED.due_date,
          completed_at = CASE
            WHEN $5 THEN COALESCE(plan_action_progress.completed_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END
      `,
      [approved.id, action.id, responsible, dueDate, done],
    );

    res.json({ progress: await getProgress(postgres, approved.id) });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar a ação.");
  }
});

// Plano concluído: pede o próximo ciclo. A sondagem do que foi feito e o novo
// plano passam pela mesma revisão da equipe antes de aparecer.
router.post("/next-cycle", verifyToken, async (req, res) => {
  try {
    const member = await getMember(req.user.id);
    if (!member || !planIncludes(member.plan, "premium")) {
      return res.status(403).json({ code: "PLAN_REQUIRED", message: "Disponível na Assinatura Anual." });
    }

    const { approved, pending } = await getMemberPlans(member.id);
    if (pending) {
      return res.status(409).json({ message: "Seu novo plano já está em análise." });
    }
    if (!approved) {
      return res.status(409).json({ message: "Você ainda não tem um plano liberado." });
    }

    const progress = await getProgress(postgres, approved.id);
    if (!isPlanFinished(normalizeContent(approved.content), progress)) {
      return res.status(409).json({ message: "Conclua as ações do plano atual antes de pedir o próximo." });
    }

    const plan = await createPendingPlan(postgres, member.id);
    startQueuedDrafts();
    res.status(201).json({
      message: "Pedido recebido. Em até 72 horas úteis nosso time devolve o seu novo plano.",
      review: { cycle: plan.cycle, requestedAt: plan.requested_at, dueAt: reviewDueAt(plan.requested_at) },
    });
  } catch (error) {
    sendError(res, error, "Não foi possível pedir o novo plano.");
  }
});

module.exports = router;
