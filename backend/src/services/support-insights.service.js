const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");
const { describeAgentError, generateSupportInsights, isAgentConfigured } = require("./agent.service");

/**
 * Duas leituras do chat de suporte para a equipe:
 * - uso indevido: cada mensagem do cliente recebe uma marca quando foge do
 *   propósito do suporte (a marca vem da própria IA, na hora da resposta);
 * - aprendizado: uma vez por semana a IA lê as conversas e sugere artigos
 *   para a base de conhecimento. Nada entra na base sem aprovação no /adm.
 */

// Marcas de uso indevido. severe = a equipe é avisada por e-mail na hora.
const SUPPORT_FLAGS = {
  fora_do_escopo: { label: "Fora do escopo", severe: false },
  dado_sigiloso: { label: "Pedido de dado sigiloso", severe: false },
  burlar_regras: { label: "Tentativa de burlar as regras", severe: true },
  ofensa: { label: "Ofensa ou assédio", severe: true },
  risco_pessoal: { label: "Risco pessoal", severe: true },
};

const WEEK_DAYS = 7;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Geração travada (servidor reiniciou no meio) deixa de bloquear depois disto.
const STALE_MINUTES = 20;
// Limite do texto das conversas enviado à IA, em caracteres.
const CONVERSATIONS_MAX_CHARS = 200000;

function serializeInsight(row) {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    error: row.error || null,
    stats: row.stats || null,
    report: row.report || null,
    createdAt: row.created_at,
  };
}

/** Conversas do período em texto, sem nome nem e-mail de ninguém. */
async function readConversations(from, to) {
  const result = await postgres.query(
    `
      SELECT s.member_id, s.role, s.content, s.flag, m.plan
      FROM support_messages s
      INNER JOIN members m ON m.id = s.member_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND m.is_platform_admin = FALSE
        AND s.role <> 'system'
      ORDER BY s.member_id, s.created_at ASC
    `,
    [from, to],
  );

  const byMember = new Map();
  for (const row of result.rows) {
    if (!byMember.has(row.member_id)) byMember.set(row.member_id, { plan: row.plan, lines: [] });
    const author = row.role === "user" ? "Cliente" : row.role === "team" ? "Equipe Gestão 360" : "Assistente";
    const mark = row.role === "user" && row.flag ? ` [marcada como uso indevido: ${row.flag}]` : "";
    byMember.get(row.member_id).lines.push(`${author}${mark}: ${row.content}`);
  }

  let text = "";
  let included = 0;
  for (const conversation of byMember.values()) {
    const block = `<conversa numero="${included + 1}" plano="${conversation.plan}">\n${conversation.lines.join("\n")}\n</conversa>\n\n`;
    if (text.length + block.length > CONVERSATIONS_MAX_CHARS) break;
    text += block;
    included += 1;
  }

  return {
    text: text.trim(),
    stats: {
      conversations: byMember.size,
      conversationsRead: included,
      userMessages: result.rows.filter((row) => row.role === "user").length,
      flagged: result.rows.filter((row) => row.role === "user" && row.flag).length,
    },
  };
}

/**
 * Gera o relatório do período. Devolve o id, ou null quando já existe uma
 * geração em andamento. A chamada à IA roda em segundo plano.
 */
async function startInsight({ from, to }) {
  const busy = await postgres.query(
    "SELECT id FROM support_insights WHERE status = 'generating' AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $1)",
    [STALE_MINUTES],
  );
  if (busy.rows.length > 0) return null;

  const id = createId("insight");
  await postgres.query(
    "INSERT INTO support_insights (id, period_start, period_end, status) VALUES ($1, $2, $3, 'generating')",
    [id, from, to],
  );

  runInsight(id, from, to).catch((error) =>
    console.error("[aprendizado] falha inesperada", error?.message || error),
  );
  return id;
}

async function runInsight(id, from, to) {
  try {
    const { text, stats } = await readConversations(from, to);
    if (!text) {
      await postgres.query(
        "UPDATE support_insights SET status = 'ready', stats = $1, report = $2 WHERE id = $3",
        [
          JSON.stringify(stats),
          JSON.stringify({ overview: "Nenhuma conversa de cliente no período.", topQuestions: [], gaps: [], suggestions: [] }),
          id,
        ],
      );
      return;
    }

    const articles = await postgres.query(
      "SELECT title, content FROM knowledge_articles WHERE active = TRUE AND kind = 'content' ORDER BY created_at ASC",
    );
    const knowledge = articles.rows
      .map((row) => `<artigo titulo="${row.title.replace(/"/g, "'")}">\n${row.content}\n</artigo>`)
      .join("\n\n");

    const report = await generateSupportInsights({ conversations: text, knowledge });
    if (!report) throw new Error("A IA recusou o pedido (refusal).");

    // Cada sugestão ganha um id e começa esperando a decisão da equipe.
    report.suggestions = report.suggestions.map((suggestion) => ({
      ...suggestion,
      id: createId("sug"),
      status: "pending",
      articleId: null,
    }));

    await postgres.query("UPDATE support_insights SET status = 'ready', stats = $1, report = $2 WHERE id = $3", [
      JSON.stringify(stats),
      JSON.stringify(report),
      id,
    ]);
    console.log(`[aprendizado] relatório pronto: ${id} (${report.suggestions.length} sugestão(ões))`);
  } catch (error) {
    console.error(`[aprendizado] falha ao gerar o relatório ${id}:`, error?.message || error);
    await postgres
      .query("UPDATE support_insights SET status = 'failed', error = $1 WHERE id = $2", [
        describeAgentError(error).replace("escrever o rascunho", "gerar o relatório"),
        id,
      ])
      .catch(() => undefined);
  }
}

/** Gera o relatório da semana quando o último já tem 7 dias e houve conversa. */
async function checkWeeklyInsight() {
  if (!isAgentConfigured()) return;

  const last = await postgres.query(
    "SELECT period_end, created_at FROM support_insights WHERE status <> 'failed' ORDER BY created_at DESC LIMIT 1",
  );
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_DAYS * 24 * 60 * 60 * 1000);
  if (last.rows[0] && new Date(last.rows[0].created_at) > weekAgo) return;

  // Continua de onde o último relatório parou, sem voltar mais de 7 dias.
  const lastEnd = last.rows[0] ? new Date(last.rows[0].period_end) : null;
  const from = lastEnd && lastEnd > weekAgo ? lastEnd : weekAgo;

  const fresh = await postgres.query(
    `
      SELECT 1 FROM support_messages s
      INNER JOIN members m ON m.id = s.member_id
      WHERE s.role = 'user' AND s.created_at >= $1 AND m.is_platform_admin = FALSE
      LIMIT 1
    `,
    [from],
  );
  if (fresh.rows.length === 0) return;

  await startInsight({ from, to: now });
}

function startInsightsWorker() {
  const tick = () =>
    checkWeeklyInsight().catch((error) =>
      console.error("[aprendizado] falha na verificação semanal", error?.message || error),
    );
  tick();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}

module.exports = {
  SUPPORT_FLAGS,
  WEEK_DAYS,
  serializeInsight,
  startInsight,
  startInsightsWorker,
};
