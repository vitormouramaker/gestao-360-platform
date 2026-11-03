const express = require("express");
const router = express.Router();
const { handleWebhook, isValidToken, isWebhookConfigured } = require("../services/hubla.service");

/**
 * Endereço que vai no campo "URL" da regra de webhook da Hubla:
 *   https://<domínio-da-api>/api/hubla/webhook
 *
 * A Hubla manda o token da regra no cabeçalho x-hubla-token; ele precisa ser
 * igual ao HUBLA_WEBHOOK_TOKEN do .env.
 */
router.post("/webhook", async (req, res) => {
  // Sem token configurado o endereço fica fechado: ninguém cria acesso de fora.
  if (!isWebhookConfigured()) {
    return res.status(503).json({ message: "Integração com a Hubla ainda não configurada." });
  }
  if (!isValidToken(req.headers["x-hubla-token"])) {
    return res.status(401).json({ message: "Token inválido." });
  }

  try {
    const result = await handleWebhook(req.body);
    return res.json({ received: true, outcome: result.outcome });
  } catch (error) {
    // 500 faz a Hubla tentar de novo mais tarde, que é o que queremos em falha nossa.
    console.error("[hubla] falha ao processar o aviso", error);
    return res.status(500).json({ message: "Falha ao processar o aviso." });
  }
});

module.exports = router;
