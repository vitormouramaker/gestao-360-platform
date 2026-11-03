require("../config/env");
const { Client } = require("pg");

/**
 * Prepara o banco do Gestão 360°: cria o banco (se ainda não existir),
 * as tabelas e o catálogo inicial de entregáveis. Pode rodar quantas vezes
 * for preciso.
 */
async function createDatabaseIfMissing() {
  const databaseName = process.env.DB_NAME;
  if (!/^[a-z0-9_]+$/i.test(String(databaseName || ""))) {
    throw new Error("DB_NAME ausente ou inválido no .env.");
  }

  const admin = new Client({
    database: "postgres",
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);
    if (existing.rows.length > 0) {
      console.log(`Banco ${databaseName} já existe.`);
      return;
    }

    await admin.query(`CREATE DATABASE "${databaseName}"`);
    console.log(`Banco ${databaseName} criado.`);
  } finally {
    await admin.end();
  }
}

async function main() {
  await createDatabaseIfMissing();

  const { ensureSchema } = require("../services/migrations.service");
  const { postgres } = require("./connect");

  await ensureSchema();
  console.log("Tabelas e catálogo de entregáveis prontos.");
  await postgres.end();
}

main().catch((error) => {
  console.error("Erro ao preparar o banco:", error?.message || error);
  process.exit(1);
});
