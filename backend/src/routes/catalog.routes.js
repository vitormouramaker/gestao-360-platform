const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth.middleware");
const { getCatalogForMember } = require("../services/catalog.service");
const { ensureSchema } = require("../services/migrations.service");
const { getRenewalNotice } = require("../services/renewal.service");
const { TOOL_CATEGORIES, getToolsForPlan } = require("../services/tools.service");

// Entregáveis dos planos, já com o que está liberado ou bloqueado para a pessoa.
router.get("/", verifyToken, async (req, res) => {
  try {
    const catalog = await getCatalogForMember(req.user.id);
    if (!catalog) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }

    // Aviso de renovação nos próximos dias; null fora dessa janela.
    res.json({ ...catalog, renewal: await getRenewalNotice(req.user.id) });
  } catch (error) {
    console.error("Erro ao carregar os entregáveis:", error);
    res.status(500).json({ message: "Não foi possível carregar os entregáveis." });
  }
});

// Ferramentas e modelos que o plano do cliente inclui.
router.get("/tools", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const catalog = await getCatalogForMember(req.user.id);
    if (!catalog) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }
    res.json({
      tools: await getToolsForPlan(catalog.plan),
      categories: Object.entries(TOOL_CATEGORIES).map(([id, label]) => ({ id, label })),
    });
  } catch (error) {
    console.error("Erro ao carregar as ferramentas:", error);
    res.status(500).json({ message: "Não foi possível carregar as ferramentas." });
  }
});

module.exports = router;
