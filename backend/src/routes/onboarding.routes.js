const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth.middleware");
const { ensureSchema } = require("../services/migrations.service");
const {
  bookOnboarding,
  cancelOnboarding,
  getMemberOnboarding,
  saveMemberNotes,
} = require("../services/onboarding.service");
const { sendError } = require("../services/tracking.service");

// Integração do CRM de quem está logado: agendamento atual e horários livres.
router.get("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    res.json(await getMemberOnboarding(req.user.id));
  } catch (error) {
    sendError(res, error, "Não foi possível carregar os horários.");
  }
});

// Body: { startsAt, whatsapp }. Agendar de novo troca o agendamento em aberto.
router.post("/", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    res.status(201).json({ booking: await bookOnboarding(req.user.id, req.body) });
  } catch (error) {
    sendError(res, error, "Não foi possível agendar.");
  }
});

router.post("/cancel", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    await cancelOnboarding(req.user.id);
    res.json({ booking: null });
  } catch (error) {
    sendError(res, error, "Não foi possível cancelar o agendamento.");
  }
});

// Registro opcional do aluno sobre como foi a integração. Body: { notes }.
router.post("/notes", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    res.json({ booking: await saveMemberNotes(req.user.id, req.body?.notes) });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o seu registro.");
  }
});

module.exports = router;
