const express = require("express");
const router = express.Router();
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const { getOrCreateTicket } = require("../services/event-tickets.service");
const { ensureSchema } = require("../services/migrations.service");
const { planIncludes } = require("../services/plans.service");
const { sendError, serializeEvent } = require("../services/tracking.service");

// Calendário de quem está logado. Eventos só do Premium aparecem para o
// Essencial como bloqueados, sem os links.
router.get("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const memberResult = await postgres.query("SELECT plan FROM members WHERE id = $1", [
      req.user.id,
    ]);
    if (memberResult.rows.length === 0) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }

    const { plan } = memberResult.rows[0];
    const result = await postgres.query("SELECT * FROM events ORDER BY starts_at ASC");

    res.json({
      events: result.rows.map((event) =>
        serializeEvent(event, { locked: !planIncludes(plan, event.plan) }),
      ),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o calendário.");
  }
});

// Ingresso de quem está logado para um evento presencial. Só é emitido para
// quem está com a assinatura ativa e tem o evento no plano.
router.get("/:eventId/ticket", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    res.json({ ticket: await getOrCreateTicket(req.user.id, req.params.eventId) });
  } catch (error) {
    sendError(res, error, "Não foi possível abrir o ingresso.");
  }
});

module.exports = router;
