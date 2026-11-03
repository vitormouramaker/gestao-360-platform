/**
 * Permissões da equipe no /adm. O administrador master vê e faz tudo, inclusive
 * cuidar da equipe. Os demais só entram nas áreas marcadas no cadastro: a área
 * libera ver e mexer em tudo o que está dentro dela.
 */

const ADMIN_AREAS = {
  students: { label: "Alunos", description: "Cadastro, acessos, e-mails e histórico de cada aluno." },
  plans: { label: "Planos", description: "Fila de revisão, editor e aprovação dos planos." },
  support: { label: "Atendimento", description: "Fila do chat e conversas com os alunos." },
  activities: { label: "Atividades", description: "Tarefas publicadas para os alunos." },
  calendar: { label: "Calendário", description: "Treinamentos, encontros e eventos presenciais." },
  tickets: { label: "Ingressos", description: "Conferência de ingressos e entrada nos eventos." },
  onboarding: { label: "Integração CRM", description: "Agendamentos das chamadas e link da chamada." },
  content: { label: "Entregáveis e ferramentas", description: "Links dos entregáveis e materiais para download." },
  ai: { label: "IA e suporte", description: "Base de conhecimento, aprendizado da IA e uso do suporte." },
  costs: { label: "Custos da IA", description: "Consumo e custo da IA." },
  hubla: { label: "Hubla", description: "Avisos de compra, renovação e cancelamento." },
  settings: { label: "Configurações", description: "Contatos, horários de atendimento e da integração." },
};

const AREA_KEYS = Object.keys(ADMIN_AREAS);

// Caminho do /api/admin -> área. A primeira regra que casar vale; caminho sem
// regra fica só para o master. "read" = o GET é liberado para qualquer
// administrador (dados que várias telas usam).
const ROUTE_RULES = [
  { pattern: /^\/overview$/, area: null },
  { pattern: /^\/team(\/|$)/, area: "master" },
  { pattern: /^\/members\/[^/]+\/plans$/, area: "plans" },
  { pattern: /^\/members(\/|$)/, area: "students" },
  { pattern: /^\/plans(\/|$)/, area: "plans" },
  { pattern: /^\/tickets(\/|$)/, area: "support" },
  { pattern: /^\/activities(\/|$)/, area: "activities" },
  { pattern: /^\/events\/[^/]+\/tickets$/, area: "tickets" },
  { pattern: /^\/events(\/|$)/, area: "calendar" },
  { pattern: /^\/event-tickets(\/|$)/, area: "tickets" },
  { pattern: /^\/onboarding-calls(\/|$)/, area: "onboarding" },
  { pattern: /^\/products(\/|$)/, area: "content" },
  { pattern: /^\/tools(\/|$)/, area: "content" },
  { pattern: /^\/(knowledge|insights|support)(\/|$)/, area: "ai" },
  { pattern: /^\/ai-usage(\/|$)/, area: "costs" },
  { pattern: /^\/hubla(\/|$)/, area: "hubla" },
  { pattern: /^\/settings$/, area: "settings", read: true },
];

function normalizePermissions(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => String(item).trim()).filter((item) => AREA_KEYS.includes(item)))];
}

/** O administrador pode fazer esta chamada? admin = { role, permissions }. */
function canAccess(admin, method, path) {
  if (admin.role === "master") return true;
  const rule = ROUTE_RULES.find((entry) => entry.pattern.test(path));
  if (!rule || rule.area === "master") return false;
  if (rule.area === null) return true;
  if (rule.read && method === "GET") return true;
  return admin.permissions.includes(rule.area);
}

function readAdmin(row) {
  return {
    role: row.admin_role === "master" ? "master" : "admin",
    permissions: normalizePermissions(row.admin_permissions),
  };
}

module.exports = {
  ADMIN_AREAS,
  AREA_KEYS,
  canAccess,
  normalizePermissions,
  readAdmin,
};
