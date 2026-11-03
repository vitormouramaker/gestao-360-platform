const { postgres } = require("../server/connect");
const { isValidPlan, normalizePlan, planIncludes } = require("./plans.service");
const { ValidationError, readText, readUrl } = require("./tracking.service");

/**
 * Ferramentas e modelos (planilhas, modelo de DRE, checklists, roteiros) que
 * o cliente baixa pela plataforma. Cada item aponta para o arquivo por um
 * link. A IA do suporte e o agente do plano recebem a lista para poder
 * indicar o material certo pelo nome.
 */

// Assunto do material, alinhado aos pilares do diagnóstico.
const TOOL_CATEGORIES = {
  financeiro: "Financeiro",
  vendas: "Vendas e Comercial",
  marketing: "Marketing",
  processos: "Processos e Operação",
  pessoas: "Pessoas e Liderança",
  geral: "Gestão geral",
};

function serializeTool(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    url: row.url,
    category: row.category,
    categoryLabel: TOOL_CATEGORIES[row.category] || row.category,
    plan: normalizePlan(row.plan),
    active: row.active,
    createdAt: row.created_at,
  };
}

function readToolInput(body = {}) {
  if (!TOOL_CATEGORIES[body.category]) {
    throw new ValidationError("Escolha o assunto do material.", "category");
  }
  if (!isValidPlan(body.plan)) {
    throw new ValidationError("Escolha para qual plano o material vale.", "plan");
  }
  const url = readUrl(body.url, { field: "url", label: "Link do arquivo" });
  if (!url) {
    throw new ValidationError("Informe o link do arquivo.", "url");
  }
  return {
    title: readText(body.title, { field: "title", label: "o título", max: 255, required: true }),
    description: readText(body.description, { field: "description", label: "A descrição", max: 1000 }),
    url,
    category: body.category,
    plan: normalizePlan(body.plan),
    active: body.active !== false,
  };
}

/** Materiais ativos que o plano do cliente inclui. */
async function getToolsForPlan(memberPlan) {
  const result = await postgres.query(
    "SELECT * FROM tools WHERE active = TRUE ORDER BY category ASC, title ASC",
  );
  return result.rows.filter((row) => planIncludes(memberPlan, row.plan)).map(serializeTool);
}

/** Lista em texto para a IA: título, assunto e para que serve. */
function describeTools(tools) {
  return tools
    .map((tool) => `- ${tool.title} (${tool.categoryLabel})${tool.description ? `: ${tool.description}` : ""}`)
    .join("\n");
}

module.exports = { TOOL_CATEGORIES, serializeTool, readToolInput, getToolsForPlan, describeTools };
