const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth.middleware");
const {
  QUESTIONS,
  getMemberDiagnostic,
  saveDraft,
  serializeDiagnostic,
  submitDiagnostic,
} = require("../services/diagnostic.service");
const { startQueuedDrafts } = require("../services/plan.service");
const { sendError } = require("../services/tracking.service");

// Perguntas da anamnese e o que a pessoa já respondeu (rascunho ou envio).
router.get("/", verifyToken, async (req, res) => {
  try {
    const diagnostic = await getMemberDiagnostic(req.user.id);
    res.json({ questions: QUESTIONS, diagnostic: serializeDiagnostic(diagnostic) });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar a anamnese.");
  }
});

// Rascunho: guarda o que já foi respondido para a pessoa poder parar e voltar.
router.put("/draft", verifyToken, async (req, res) => {
  try {
    const diagnostic = await saveDraft(req.user.id, req.body?.answers);
    res.json({ diagnostic: serializeDiagnostic(diagnostic) });
  } catch (error) {
    sendError(res, error, "Não foi possível salvar o rascunho.");
  }
});

// Envio definitivo. A partir daqui o plano entra na fila de revisão da equipe.
router.post("/", verifyToken, async (req, res) => {
  try {
    const diagnostic = await submitDiagnostic(req.user.id, req.body?.answers);
    // A IA escreve o rascunho em segundo plano; a resposta não espera por ela.
    startQueuedDrafts();
    res.status(201).json({
      message: "Anamnese enviada. Em até 72 horas úteis nosso time devolve o seu diagnóstico.",
      diagnostic: serializeDiagnostic(diagnostic),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível enviar a anamnese.");
  }
});

module.exports = router;
