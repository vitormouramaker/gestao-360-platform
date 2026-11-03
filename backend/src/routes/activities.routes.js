const express = require("express");
const router = express.Router();
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const { ensureSchema } = require("../services/migrations.service");
const { normalizePlan, planIncludes } = require("../services/plans.service");
const { sendError, serializeActivity } = require("../services/tracking.service");

const PLAN_REQUIRED = { code: "PLAN_REQUIRED", message: "Disponível na Assinatura Anual." };

// Atividades práticas semanais (entregável do Premium). São as mesmas para
// todos do plano; cada pessoa marca as suas como feitas.
router.get("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const memberResult = await postgres.query("SELECT plan FROM members WHERE id = $1", [req.user.id]);
    if (memberResult.rows.length === 0) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }
    if (!planIncludes(memberResult.rows[0].plan, "premium")) {
      return res.status(403).json(PLAN_REQUIRED);
    }

    const result = await postgres.query(
      `
        SELECT a.*, p.completed_at
        FROM activities a
        LEFT JOIN activity_progress p ON p.activity_id = a.id AND p.member_id = $1
        WHERE a.audience IN ($2, 'all')
        ORDER BY a.published_at DESC
      `,
      [req.user.id, normalizePlan(memberResult.rows[0].plan)],
    );
    res.json({ activities: result.rows.map(serializeActivity) });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar as atividades.");
  }
});

// Marca (ou desmarca) uma atividade como feita. Body: { done: boolean }
router.patch("/:id", verifyToken, async (req, res) => {
  if (typeof req.body?.done !== "boolean") {
    return res.status(400).json({ message: "Informe se a atividade foi feita." });
  }

  try {
    const allowed = await postgres.query(
      `
        SELECT a.id FROM activities a
        INNER JOIN members m ON m.id = $2
        WHERE a.id = $1 AND a.audience IN (m.plan, 'all')
      `,
      [req.params.id, req.user.id],
    );
    if (allowed.rows.length === 0) {
      return res.status(404).json({ message: "Atividade não encontrada." });
    }

    if (req.body.done) {
      await postgres.query(
        "INSERT INTO activity_progress (activity_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [req.params.id, req.user.id],
      );
    } else {
      await postgres.query(
        "DELETE FROM activity_progress WHERE activity_id = $1 AND member_id = $2",
        [req.params.id, req.user.id],
      );
    }
    res.json({ id: req.params.id, done: req.body.done });
  } catch (error) {
    sendError(res, error, "Não foi possível atualizar a atividade.");
  }
});

module.exports = router;
