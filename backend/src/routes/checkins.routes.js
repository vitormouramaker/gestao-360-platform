const express = require("express");
const router = express.Router();
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const {
  PROGRESS_OPTIONS,
  REASON_OPTIONS,
  buildFeedback,
  currentPeriod,
  isValidProgress,
  isValidReason,
  needsReason,
  serializeCheckin,
} = require("../services/checkin.service");
const { ensureSchema } = require("../services/migrations.service");
const { ValidationError, readText, sendError } = require("../services/tracking.service");
const { createId } = require("../utils/ids");

// Check-in do mês corrente (se já foi feito) e os anteriores.
router.get("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const result = await postgres.query(
      "SELECT * FROM checkins WHERE member_id = $1 ORDER BY period DESC LIMIT 24",
      [req.user.id],
    );
    const period = currentPeriod();
    const checkins = result.rows.map(serializeCheckin);

    res.json({
      period,
      current: checkins.find((checkin) => checkin.period === period) || null,
      history: checkins.filter((checkin) => checkin.period !== period),
      progressOptions: PROGRESS_OPTIONS,
      reasonOptions: REASON_OPTIONS,
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar o check-in.");
  }
});

// Body: { progress, reason?, evolution? }. Um check-in por mês.
router.post("/", verifyToken, async (req, res) => {
  try {
    const body = req.body || {};
    if (!isValidProgress(body.progress)) {
      throw new ValidationError("Diga como foi o andamento do seu plano neste mês.", "progress");
    }

    const reason = needsReason(body.progress) ? body.reason : null;
    if (needsReason(body.progress) && !isValidReason(reason)) {
      throw new ValidationError("Escolha o principal motivo.", "reason");
    }
    const evolution = readText(body.evolution, { field: "evolution", label: "A evolução", max: 1000 });

    const result = await postgres.query(
      `
        INSERT INTO checkins (id, member_id, period, progress, reason, evolution, feedback)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (member_id, period) DO NOTHING
        RETURNING *
      `,
      [
        createId("checkin"),
        req.user.id,
        currentPeriod(),
        body.progress,
        reason,
        evolution,
        buildFeedback(body.progress, reason),
      ],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: "Você já fez o check-in deste mês." });
    }
    res.status(201).json({ checkin: serializeCheckin(result.rows[0]) });
  } catch (error) {
    sendError(res, error, "Não foi possível registrar o check-in.");
  }
});

module.exports = router;
