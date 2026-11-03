// Confere se a chave da IA (ANTHROPIC_API_KEY) e o workspace
// (ANTHROPIC_WORKSPACE_ID) deste ambiente funcionam. Não imprime a chave.
//   node scripts/testar-ia.js
require("../src/config/env");
const { MODEL, isAgentConfigured, pingAgent } = require("../src/services/agent.service");

async function main() {
  if (!isAgentConfigured()) {
    console.log("IA desligada: falta ANTHROPIC_API_KEY.");
    process.exit(1);
  }
  console.log(`modelo pedido: ${MODEL}`);
  console.log(`workspace informado: ${process.env.ANTHROPIC_WORKSPACE_ID ? "sim" : "nao"}`);
  try {
    const result = await pingAgent();
    console.log(`IA respondeu. modelo: ${result.model}`);
  } catch (error) {
    console.log(`IA recusou a chamada (${error?.status || "sem status"}): ${error?.message || error}`);
    process.exit(1);
  }
}

main();
