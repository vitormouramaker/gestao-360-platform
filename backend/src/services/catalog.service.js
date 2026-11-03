const { postgres } = require("../server/connect");
const { ensureSchema } = require("./migrations.service");
const { PLANS, normalizePlan, planIncludes } = require("./plans.service");
const { getAccountNotes } = require("./provisioning.service");

function getSupportWhatsapp() {
  return String(process.env.SUPPORT_WHATSAPP || "").replace(/\D/g, "") || null;
}

function getPremiumCheckoutUrl() {
  return String(process.env.PREMIUM_CHECKOUT_URL || "").trim() || null;
}

/**
 * Entregáveis da plataforma do ponto de vista de quem está logado: o que o
 * plano não cobre vem marcado como bloqueado e sem o endereço de acesso.
 */
async function getCatalogForMember(memberId) {
  await ensureSchema();

  const memberResult = await postgres.query(
    "SELECT plan, crm_enabled FROM members WHERE id = $1",
    [memberId],
  );
  if (memberResult.rows.length === 0) {
    return null;
  }

  const plan = normalizePlan(memberResult.rows[0].plan);
  // CRM desligado para este cliente: o entregável CRM nem aparece no catálogo.
  const crmEnabled = memberResult.rows[0].crm_enabled !== false;
  // O link individual do aluno (ex.: ingresso) vence o link geral do entregável.
  const productsResult = await postgres.query(
    `
      SELECT p.id, p.slug, p.name, p.description, p.plan, p.icon, p.art, p.internal_page,
             COALESCE(NULLIF(a.access_url, ''), p.access_url) AS access_url,
             a.note AS access_note
      FROM products p
      LEFT JOIN member_product_access a ON a.product_id = p.id AND a.member_id = $1
      WHERE p.is_active = TRUE
      ORDER BY p.sort_order ASC, p.name ASC
    `,
    [memberId],
  );

  // Situação do acesso nas plataformas externas (criado, em preparação, já era cliente).
  const accountNotes = await getAccountNotes(memberId);

  const products = productsResult.rows
    .filter((product) => crmEnabled || product.slug !== "crm")
    .map((product) => {
    const locked = !planIncludes(plan, product.plan);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      plan: normalizePlan(product.plan),
      icon: product.icon,
      art: product.art,
      locked,
      // Tela da própria plataforma que este entregável abre (diagnóstico, calendário...).
      page: product.internal_page || null,
      accessUrl: locked ? null : product.access_url || null,
      // O recado escrito pela equipe vence o automático.
      accessNote: locked ? null : product.access_note || accountNotes[product.slug] || null,
    };
  });

  return {
    plan,
    planName: PLANS[plan].name,
    plans: Object.values(PLANS).map(({ id, name, price }) => ({ id, name, price })),
    products,
    upgrade: { checkoutUrl: getPremiumCheckoutUrl() },
    support: { whatsapp: getSupportWhatsapp() },
  };
}

module.exports = { getCatalogForMember };
