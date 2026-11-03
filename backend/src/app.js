require("./config/env");

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { runStartupMigrations } = require("./services/migrations.service");
const { startSessionCleanupWorker } = require("./services/session.service");

const app = express();
const PORT = Number(process.env.PORT) || 4460;

// Origens liberadas por padrão. Para adicionar outras (ex.: novo domínio),
// use CORS_ORIGINS no .env separando por vírgula.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5180",
  "http://127.0.0.1:5180",
  "http://localhost:4180",
];

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

const allowedOrigins = new Set(
  [
    ...DEFAULT_ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
    ...String(process.env.CORS_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

// Só para os testes automatizados; em produção o limitador é sempre aplicado.
const RATE_LIMIT_DESLIGADO =
  process.env.DISABLE_RATE_LIMIT === "true" && process.env.NODE_ENV !== "production";

function createLimiter({ windowMinutes, limit, message, ...options }) {
  return rateLimit({
    skip: () => RATE_LIMIT_DESLIGADO,
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message },
    ...options,
  });
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // Requisições sem Origin (servidor-a-servidor, curl) não passam por CORS.
      callback(null, !origin || allowedOrigins.has(normalizeOrigin(origin)));
    },
  }),
);

app.use(
  "/api/auth/login",
  createLimiter({
    windowMinutes: 15,
    limit: 10,
    skipSuccessfulRequests: true,
    message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  }),
);
app.use(
  ["/api/auth/forgot-password", "/api/auth/reset-password"],
  createLimiter({
    windowMinutes: 15,
    limit: 5,
    message: "Muitas solicitações de senha. Tente novamente em alguns minutos.",
  }),
);
app.use(
  "/api",
  createLimiter({
    windowMinutes: 1,
    limit: 1200,
    message: "Muitas requisições. Aguarde alguns instantes.",
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Import rotas
const authRoutes = require("./routes/auth.routes");
const catalogRoutes = require("./routes/catalog.routes");

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/diagnostic", require("./routes/diagnostic.routes"));
app.use("/api/plan", require("./routes/plan.routes"));
app.use("/api/activities", require("./routes/activities.routes"));
app.use("/api/checkins", require("./routes/checkins.routes"));
app.use("/api/support", require("./routes/support.routes"));
app.use("/api/hubla", require("./routes/hubla.routes"));
app.use("/api/events", require("./routes/events.routes"));
app.use("/api/onboarding", require("./routes/onboarding.routes"));

// Imagem invisível dos e-mails (ver email-log.service): marca quando o e-mail foi aberto.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
app.get("/api/e/:id", (req, res) => {
  require("./services/email-log.service").markOpened(req.params.id).catch(() => undefined);
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" });
  res.send(PIXEL);
});
app.use("/api/admin", require("./routes/admin.routes"));

// Portao do ambiente fechado (homologacao): so existe quando ha senha.
const portaoRoutes = require("./routes/portao.routes");
if (portaoRoutes.portaoLigado()) {
  app.use(
    "/api/portao/entrar",
    createLimiter({
      windowMinutes: 15,
      limit: 20,
      skip: (req) => req.method !== "POST",
      message: "Muitas tentativas. Aguarde alguns minutos.",
    }),
  );
  app.use("/api/portao", portaoRoutes);
  console.log("[portao] ambiente fechado por senha");
}

// Monitor de disponibilidade: 200 só enquanto o serviço consegue falar com o
// banco. Se o banco cair, responde 503.
app.get("/api/health", async (_req, res) => {
  const { checarEssencial } = require("./services/health.service");
  const resultado = await checarEssencial();
  res.status(resultado.status === "ok" ? 200 : 503).json({ ...resultado, port: PORT });
});

// Resposta padrão para erro não tratado, sem vazar detalhe interno.
app.use((erro, _req, res, _next) => {
  console.error("[erro não tratado]", erro?.stack || erro?.message || erro);
  if (res.headersSent) return;
  res.status(erro?.status || 500).json({ message: "Erro inesperado. Tente novamente." });
});

process.on("unhandledRejection", (motivo) => {
  console.error("[promessa sem tratamento]", motivo);
});

process.on("uncaughtException", (erro) => {
  console.error("[exceção não capturada]", erro);
});

const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`Rodando na porta ${PORT}`);
  await runStartupMigrations();
  startSessionCleanupWorker();
  // Retoma os rascunhos da IA que ficaram na fila.
  require("./services/plan.service")
    .resumeDrafts()
    .catch((error) => console.error("[agente] falha ao retomar a fila", error?.message || error));
  // Relatório semanal das conversas do suporte.
  require("./services/support-insights.service").startInsightsWorker();
  // Atendimento assumido e parado volta para a fila.
  require("./services/support-tickets.service").startTicketsWorker();
  // Lembrete por e-mail 3 dias antes da renovação da assinatura.
  require("./services/renewal.service").startRenewalWorker();
  // Fila dos acessos nas plataformas externas (Academy, Formação Executiva, CRM).
  require("./services/provisioning.service").startProvisioningWorker();
  // Fila dos ingressos no sistema de credenciamento.
  require("./services/credenciamento.service").startCredenciamentoWorker();
});
