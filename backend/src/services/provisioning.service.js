const { postgres } = require("../server/connect");
const { nextMonthlyDate } = require("./renewal.service");

/**
 * Acessos nas plataformas externas incluídas no programa: Academy,
 * Formação Executiva e CRM. Cada plataforma expõe rotas de integração
 * (/integracao/gestao360/...) protegidas por uma chave que só o 360 conhece.
 *
 * O 360 guarda, por cliente e por plataforma, o que deveria estar valendo
 * (ativo até uma data, ou bloqueado) e se a plataforma já confirmou. Uma fila
 * com nova tentativa cuida de plataforma fora do ar. As rotas do outro lado
 * são idempotentes, então repetir uma chamada não duplica nada.
 */

// Cada plataforma só é chamada quando o endereço e a chave estão configurados.
const PLATFORMS = {
  academy: {
    label: "Academy",
    productSlug: "academy",
    urlEnv: "ACADEMY_INTEGRATION_URL",
    keyEnv: "ACADEMY_INTEGRATION_KEY",
  },
  formacao_executiva: {
    label: "Formação Executiva",
    productSlug: "formacao-executiva",
    urlEnv: "FORMACAO_EXECUTIVA_INTEGRATION_URL",
    keyEnv: "FORMACAO_EXECUTIVA_INTEGRATION_KEY",
  },
  crm: {
    label: "CRM",
    productSlug: "crm",
    urlEnv: "CRM_INTEGRATION_URL",
    keyEnv: "CRM_INTEGRATION_KEY",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
// A validade enviada passa alguns dias da renovação, para o acesso externo
// não cair enquanto a Hubla ainda confirma o pagamento do novo ciclo.
const GRACE_DAYS = 3;
// Sem data de renovação conhecida, o acesso vale por este período e é
// estendido sozinho enquanto a assinatura seguir ativa.
const DEFAULT_VALIDITY_DAYS = 35;
// Quando faltar menos que isto para a validade enviada, ela é renovada.
const REFRESH_BEFORE_DAYS = 10;
const REQUEST_TIMEOUT_MS = 20000;
const WORKER_INTERVAL_MS = 60 * 1000;
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Espera entre tentativas, em minutos. Depois da última, fica como falha.
const RETRY_MINUTES = [1, 5, 30, 120, 360, 720];

function platformConfig(id) {
  const platform = PLATFORMS[id];
  const url = String(process.env[platform.urlEnv] || "").trim().replace(/\/+$/, "");
  const key = String(process.env[platform.keyEnv] || "").trim();
  return url && key ? { url, key } : null;
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Até quando o acesso externo deve valer, pela assinatura do cliente. */
async function computeValidUntil(member) {
  const entitlement = await postgres.query(
    "SELECT MAX(renews_at) AS renews_at FROM member_entitlements WHERE member_id = $1 AND active = TRUE",
    [member.id],
  );
  const renewsAt = entitlement.rows[0]?.renews_at;
  const manual = !renewsAt && member.purchase_date ? nextMonthlyDate(member.purchase_date) : null;

  const base = renewsAt && new Date(renewsAt) > new Date() ? new Date(renewsAt) : manual;
  const until = base
    ? new Date(base.getTime() + GRACE_DAYS * DAY_MS)
    : new Date(Date.now() + DEFAULT_VALIDITY_DAYS * DAY_MS);
  return toDateOnly(until);
}

/**
 * Coloca na fila o que as plataformas precisam saber sobre este cliente:
 * acesso ativo até uma data, ou bloqueio. Chamado sempre que a assinatura
 * muda (compra, renovação, cancelamento, alteração pelo /adm).
 */
async function syncMember(memberId) {
  const result = await postgres.query("SELECT * FROM members WHERE id = $1", [memberId]);
  const member = result.rows[0];
  // A equipe da Gestão 360 não recebe acessos automáticos.
  if (!member || member.is_platform_admin) return;

  const active = member.plan_status === "active";
  const validUntil = active ? await computeValidUntil(member) : null;

  for (const platform of Object.keys(PLATFORMS)) {
    // CRM só vale para quem tem a integração ligada (grandfather ou override).
    // Desligado: trata como inativo, bloqueando um acesso que já exista.
    const platformActive = active && (platform !== "crm" || member.crm_enabled);
    if (!platformActive) {
      // Só há o que bloquear onde um acesso chegou a ser pedido.
      await postgres.query(
        `
          UPDATE external_accounts
          SET desired = 'blocked', status = 'pending', attempts = 0, last_error = NULL,
              next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE member_id = $1 AND platform = $2 AND desired <> 'blocked'
        `,
        [member.id, platform],
      );
      continue;
    }

    await postgres.query(
      `
        INSERT INTO external_accounts (member_id, platform, desired, valid_until, status, next_attempt_at)
        VALUES ($1, $2, 'active', $3, 'pending', CURRENT_TIMESTAMP)
        ON CONFLICT (member_id, platform) DO UPDATE SET
          desired = 'active',
          valid_until = EXCLUDED.valid_until,
          status = 'pending',
          attempts = 0,
          last_error = NULL,
          next_attempt_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE external_accounts.desired <> 'active'
           OR external_accounts.valid_until IS DISTINCT FROM EXCLUDED.valid_until
           OR external_accounts.status = 'failed'
      `,
      [member.id, platform, validUntil],
    );
  }
}

/** Versão que nunca lança: mudança de assinatura não pode falhar por causa disto. */
function syncMemberSafely(memberId) {
  return syncMember(memberId)
    .then(() => processQueue())
    .catch((error) => console.error("[acessos] falha ao enfileirar", memberId, error?.message || error));
}

/** A integração desta plataforma está ligada neste ambiente? */
function isPlatformConfigured(platformId) {
  const platform = PLATFORMS[platformId];
  return Boolean(platform && process.env[platform.urlEnv] && process.env[platform.keyEnv]);
}

async function callPlatform(platformId, path, body) {
  const config = platformConfig(platformId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/integracao/gestao360/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-integration-key": config.key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.mensagem || `A plataforma respondeu ${response.status}.`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

let running = false;

/** Processa o que está pendente e na hora de tentar. Uma rodada por vez. */
async function processQueue() {
  if (running) return;
  running = true;
  try {
    const due = await postgres.query(`
      SELECT a.*, m.name, m.email
      FROM external_accounts a
      INNER JOIN members m ON m.id = a.member_id
      WHERE a.status = 'pending' AND a.next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY a.next_attempt_at ASC
      LIMIT 30
    `);

    for (const row of due.rows) {
      // Plataforma ainda não ligada: fica pendente, sem contar tentativa.
      if (!platformConfig(row.platform)) continue;

      try {
        const data =
          row.desired === "blocked"
            ? await callPlatform(row.platform, "bloquear", { email: row.email })
            : await callPlatform(row.platform, "provisionar", {
                email: row.email,
                nome: row.name,
                validade: toDateOnly(row.valid_until),
                referencia: row.member_id,
              });

        await postgres.query(
          `
            UPDATE external_accounts
            SET status = 'ok', remote_status = $3, remote_id = COALESCE($4, remote_id),
                last_error = NULL, synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE member_id = $1 AND platform = $2
          `,
          [
            row.member_id,
            row.platform,
            // Conta criada, mas a plataforma não conseguiu mandar o e-mail com a senha.
            data.status === "criado" && data.email_enviado === false
              ? "criado_sem_email"
              : String(data.status || "").slice(0, 40),
            data.aluno_id ?? data.empresa_id ?? null,
          ],
        );
      } catch (error) {
        const attempts = row.attempts + 1;
        const wait = RETRY_MINUTES[attempts - 1];
        await postgres.query(
          `
            UPDATE external_accounts
            SET attempts = $3, last_error = $4, status = $5,
                next_attempt_at = CURRENT_TIMESTAMP + make_interval(mins => $6),
                updated_at = CURRENT_TIMESTAMP
            WHERE member_id = $1 AND platform = $2
          `,
          [
            row.member_id,
            row.platform,
            attempts,
            String(error?.name === "AbortError" ? "A plataforma não respondeu a tempo." : error?.message || error).slice(0, 500),
            wait ? "pending" : "failed",
            wait || 0,
          ],
        );
        console.error(`[acessos] ${row.platform} falhou para ${row.member_id} (tentativa ${attempts})`);
      }
    }
  } finally {
    running = false;
  }
}

/** Estende a validade de quem segue ativo e está perto de vencer do lado de lá. */
async function refreshExpiring() {
  const result = await postgres.query(
    `
      SELECT DISTINCT a.member_id
      FROM external_accounts a
      INNER JOIN members m ON m.id = a.member_id
      WHERE a.desired = 'active' AND m.plan_status = 'active' AND m.is_platform_admin = FALSE
        AND a.valid_until < CURRENT_DATE + make_interval(days => $1)
    `,
    [REFRESH_BEFORE_DAYS],
  );
  for (const row of result.rows) await syncMember(row.member_id);
}

function startProvisioningWorker() {
  const run = (task, label) => () =>
    task().catch((error) => console.error(`[acessos] falha em ${label}`, error?.message || error));
  setInterval(run(processQueue, "processar a fila"), WORKER_INTERVAL_MS).unref();
  setInterval(run(refreshExpiring, "renovar validades"), REFRESH_INTERVAL_MS).unref();
  run(processQueue, "processar a fila")();
}

function serializeAccount(row) {
  return {
    platform: row.platform,
    label: PLATFORMS[row.platform]?.label || row.platform,
    configured: Boolean(PLATFORMS[row.platform] && platformConfig(row.platform)),
    desired: row.desired,
    // pending (na fila), ok (a plataforma confirmou) ou failed (parou de tentar).
    status: row.status,
    // O que a plataforma respondeu: criado, reativado, ja_existia, ja_cliente, bloqueado...
    remoteStatus: row.remote_status || null,
    validUntil: row.valid_until ? toDateOnly(row.valid_until) : null,
    attempts: row.attempts,
    lastError: row.last_error || null,
    syncedAt: row.synced_at || null,
  };
}

/** Situação dos acessos externos de um cliente, uma linha por plataforma. */
async function getMemberAccounts(memberId) {
  const result = await postgres.query("SELECT * FROM external_accounts WHERE member_id = $1", [memberId]);
  return Object.keys(PLATFORMS).map((platform) => {
    const row = result.rows.find((item) => item.platform === platform);
    return row
      ? serializeAccount(row)
      : {
          platform,
          label: PLATFORMS[platform].label,
          configured: Boolean(platformConfig(platform)),
          desired: null,
          status: null,
          remoteStatus: null,
          validUntil: null,
          attempts: 0,
          lastError: null,
          syncedAt: null,
        };
  });
}

/**
 * Recado para o card do entregável, conforme a situação do acesso. Devolve
 * null quando não há nada a dizer (plataforma ainda não ligada ao 360).
 */
function accountNote(platform, account) {
  if (!account || account.desired !== "active") return null;
  const name = PLATFORMS[platform].label;

  if (account.status === "ok") {
    if (account.remote_status === "ja_cliente") {
      return `Você já é cliente ${name}. Continue usando o seu acesso atual: ele não foi alterado.`;
    }
    if (account.remote_status === "criado_sem_email") {
      return `Seu acesso à plataforma ${name} foi criado. Para definir a sua senha, use "Esqueci a senha" na tela de entrada da plataforma, com este mesmo e-mail.`;
    }
    if (account.remote_status === "ja_existia") {
      return `Você já tinha uma conta na plataforma ${name} com este e-mail. Entre com a senha que você já usa.`;
    }
    return `Seu acesso à plataforma ${name} foi criado. As instruções para entrar foram enviadas para o seu e-mail.`;
  }
  if (!platformConfig(platform)) return null;
  return `Seu acesso à plataforma ${name} está sendo preparado. Você recebe um e-mail assim que estiver pronto.`;
}

/** Recados dos cards, por slug do entregável. */
async function getAccountNotes(memberId) {
  const result = await postgres.query("SELECT * FROM external_accounts WHERE member_id = $1", [memberId]);
  const notes = {};
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    const note = accountNote(platform, result.rows.find((row) => row.platform === platform));
    if (note) notes[config.productSlug] = note;
  }
  return notes;
}

async function countFailed() {
  const result = await postgres.query(
    "SELECT COUNT(*)::int AS total FROM external_accounts WHERE status = 'failed'",
  );
  return result.rows[0].total;
}

module.exports = {
  PLATFORMS,
  callPlatform,
  isPlatformConfigured,
  syncMember,
  syncMemberSafely,
  processQueue,
  refreshExpiring,
  startProvisioningWorker,
  getMemberAccounts,
  getAccountNotes,
  countFailed,
};
