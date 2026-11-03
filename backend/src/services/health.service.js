const { postgres } = require("../server/connect");

/**
 * Health check de verdade: diz se o serviço consegue trabalhar, não apenas se
 * o processo está no ar. Responde rápido e nunca estoura em erro — devolve o
 * que falhou.
 */

const TEMPO_LIMITE_MS = Number(process.env.HEALTH_TIMEOUT_MS || 3000);
const iniciadoEm = Date.now();

/** Executa a verificação com tempo limite, sempre devolvendo um resultado. */
async function medir(nome, tarefa) {
  const comecou = Date.now();
  let temporizador = null;

  try {
    const resultado = await Promise.race([
      tarefa(),
      new Promise((_resolve, reject) => {
        temporizador = setTimeout(
          () => reject(new Error(`sem resposta em ${TEMPO_LIMITE_MS}ms`)),
          TEMPO_LIMITE_MS,
        );
      }),
    ]);
    return { nome, ok: true, ms: Date.now() - comecou, ...(resultado || {}) };
  } catch (error) {
    return { nome, ok: false, ms: Date.now() - comecou, erro: error?.message || String(error) };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** O banco responde e aceita leitura? */
function checarBanco() {
  return medir("banco", async () => {
    const { rows } = await postgres.query("SELECT 1 AS ok");
    if (rows[0]?.ok !== 1) throw new Error("resposta inesperada do banco");
    return {
      pool: { total: postgres.totalCount, livres: postgres.idleCount, naFila: postgres.waitingCount },
    };
  });
}

async function checarEssencial() {
  const banco = await checarBanco();
  return {
    status: banco.ok ? "ok" : "fora",
    service: "gestao-360-backend",
    version: process.env.APP_VERSION || process.env.GIT_COMMIT || null,
    uptimeSegundos: Math.round((Date.now() - iniciadoEm) / 1000),
    checagens: [banco],
  };
}

module.exports = { checarEssencial };
