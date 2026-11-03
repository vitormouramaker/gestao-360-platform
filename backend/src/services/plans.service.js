/**
 * Planos do Gestão 360°. O Premium inclui tudo do Essencial.
 */
const PLANS = {
  essencial: { id: "essencial", name: "Plano", rank: 1, price: "R$ 197/mês" },
  premium: { id: "premium", name: "Assinatura Anual", rank: 2, price: "R$ 397/mês" },
};

const DEFAULT_PLAN = "essencial";

function normalizePlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  return PLANS[plan] ? plan : DEFAULT_PLAN;
}

function isValidPlan(value) {
  return Boolean(PLANS[String(value || "").trim().toLowerCase()]);
}

/** O plano da pessoa dá direito a um entregável do plano informado? */
function planIncludes(memberPlan, productPlan) {
  return PLANS[normalizePlan(memberPlan)].rank >= PLANS[normalizePlan(productPlan)].rank;
}

module.exports = { PLANS, DEFAULT_PLAN, normalizePlan, isValidPlan, planIncludes };
