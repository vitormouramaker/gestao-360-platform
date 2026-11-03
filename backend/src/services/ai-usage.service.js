const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");

/**
 * Consumo da API da IA, uma linha por chamada. É a base do centro de custo:
 * o /adm soma os tokens por tipo de uso e estima o valor em dólar.
 */

const USAGE_KINDS = {
  plan_draft: "Rascunho do diagnóstico e do plano",
  support_reply: "Resposta do chat de suporte",
  support_insights: "Relatório semanal de aprendizado",
};

// Preço em dólar por milhão de tokens (tabela pública da Anthropic, out/2026).
// A conta é uma estimativa: o valor cobrado é o do console da Anthropic.
const PRICES = [
  { match: /sonnet/, input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  { match: /haiku/, input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
];

function priceOf(model) {
  return PRICES.find((price) => price.match.test(String(model || ""))) || null;
}

/** Custo estimado, em dólar, de um conjunto de tokens em um modelo. */
function estimateCost(model, tokens) {
  const price = priceOf(model);
  // Modelo fora da tabela: sem estimativa (o /adm avisa).
  if (!price) return 0;
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      tokens.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}

/**
 * Registra o consumo de uma chamada. Nunca lança: falhar ao registrar não
 * pode derrubar a resposta ao cliente.
 */
function recordUsage(kind, response) {
  const usage = response?.usage;
  if (!usage) return;

  postgres
    .query(
      `
        INSERT INTO ai_usage (id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        createId("use"),
        kind,
        response.model || null,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        usage.cache_read_input_tokens || 0,
        usage.cache_creation_input_tokens || 0,
      ],
    )
    .catch((error) => console.error("[consumo] falha ao registrar", error?.message || error));
}

/** Consumo por mês e por tipo de uso, dos últimos 6 meses. */
async function readUsageSummary() {
  const result = await postgres.query(`
    SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS month,
           kind, model,
           COUNT(*)::int AS calls,
           SUM(input_tokens)::bigint AS input,
           SUM(output_tokens)::bigint AS output,
           SUM(cache_read_tokens)::bigint AS cache_read,
           SUM(cache_write_tokens)::bigint AS cache_write
    FROM ai_usage
    WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '6 months'
    GROUP BY 1, kind, model
    ORDER BY 1 DESC, kind ASC
  `);

  // Modelos diferentes do mesmo tipo de uso são somados em uma linha só.
  const months = new Map();
  for (const row of result.rows) {
    const tokens = {
      input: Number(row.input),
      output: Number(row.output),
      cacheRead: Number(row.cache_read),
      cacheWrite: Number(row.cache_write),
    };
    const cost = estimateCost(row.model, tokens);

    if (!months.has(row.month)) months.set(row.month, new Map());
    const kinds = months.get(row.month);
    const current = kinds.get(row.kind) || {
      kind: row.kind,
      calls: 0,
      tokens: 0,
      costUsd: 0,
      models: [],
      unknownPrice: false,
    };
    if (!priceOf(row.model)) current.unknownPrice = true;
    current.calls += row.calls;
    current.tokens += tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
    current.costUsd += cost;
    if (row.model && !current.models.includes(row.model)) current.models.push(row.model);
    kinds.set(row.kind, current);
  }

  return [...months.entries()].map(([month, kinds]) => {
    const items = [...kinds.values()].map((item) => ({
      ...item,
      label: USAGE_KINDS[item.kind] || item.kind,
      costPerCallUsd: item.calls ? item.costUsd / item.calls : 0,
    }));
    return { month, items, costUsd: items.reduce((sum, item) => sum + item.costUsd, 0) };
  });
}

module.exports = { USAGE_KINDS, estimateCost, recordUsage, readUsageSummary };
