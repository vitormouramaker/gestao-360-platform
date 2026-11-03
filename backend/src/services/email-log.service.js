const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");

/**
 * Registro dos e-mails mandados a alunos e administradores, para a equipe ver
 * no /adm se cada um saiu e se foi aberto.
 *
 * - Enviado: o servidor de e-mail aceitou a mensagem. Não garante a caixa de
 *   entrada (pode cair no spam), mas garante que saiu daqui.
 * - Falhou: o servidor de e-mail recusou; nada chegou ao aluno.
 * - Aberto: o aluno abriu o e-mail com as imagens carregadas (uma imagem
 *   invisível do 360 foi pedida). É uma estimativa: há leitores que bloqueiam
 *   imagens (aberto sem registro) e o Mail da Apple abre sozinho (registro sem
 *   leitura de fato).
 */

const KIND_LABELS = {
  access: "Acesso liberado: criar a senha",
  guide: "Boas-vindas e primeiros passos",
  ticket: "Ingresso gerado",
  onboarding_booked: "Integração do CRM agendada",
  onboarding_link: "Link da chamada de integração",
  plan_ready: "Plano de ação liberado",
  renewal: "Lembrete de renovação",
  admin_access: "Acesso de administrador",
  reset_password: "Recuperação de senha",
};

/** Endereço público da API, para a imagem de abertura. Vazio = sem rastrear abertura. */
function publicApiUrl() {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/+$/, "");
  // localhost:5180 -> localhost:4460 (vale também para a homologação).
  const front = String(process.env.FRONTEND_URL || "http://localhost:5180").replace(/\/+$/, "");
  const match = /^(https:\/\/)([^./]+)(\..+)$/.exec(front);
  return match ? `${match[1]}${match[2]}-back${match[3]}` : "";
}

/** Abre o registro antes do envio. Devolve o id (ou null se o registro falhar). */
async function startLog({ memberId, kind, subject, to, manual = false }) {
  try {
    const id = createId("mail");
    await postgres.query(
      `
        INSERT INTO email_log (id, member_id, kind, subject, recipient, manual, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'sending')
      `,
      [id, memberId, kind, String(subject).slice(0, 255), String(to).slice(0, 255), Boolean(manual)],
    );
    return id;
  } catch (error) {
    // O registro nunca impede o e-mail de sair.
    console.error("[e-mails] falha ao registrar o envio", error?.message || error);
    return null;
  }
}

async function finishLog(id, { sent, error = null, messageId = null }) {
  if (!id) return;
  await postgres
    .query("UPDATE email_log SET status = $2, error = $3, message_id = $4 WHERE id = $1", [
      id,
      sent ? "sent" : "failed",
      error ? String(error).slice(0, 500) : null,
      messageId ? String(messageId).slice(0, 255) : null,
    ])
    .catch((err) => console.error("[e-mails] falha ao fechar o registro", err?.message || err));
}

/** Imagem invisível do e-mail foi pedida: o e-mail foi aberto. */
async function markOpened(id) {
  if (!/^mail_[a-f0-9]{16}$/.test(String(id || ""))) return;
  await postgres.query(
    `
      UPDATE email_log
      SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP), open_count = open_count + 1
      WHERE id = $1
    `,
    [id],
  );
}

function serializeLog(row) {
  return {
    id: row.id,
    kind: row.kind,
    label: KIND_LABELS[row.kind] || row.kind,
    subject: row.subject,
    recipient: row.recipient,
    manual: row.manual,
    status: row.status,
    error: row.error,
    sentAt: row.created_at,
    openedAt: row.opened_at,
    openCount: row.open_count,
  };
}

/**
 * Situação de entrega de um aluno: histórico de e-mails e os sinais de que ele
 * recebeu o acesso (abriu o link, criou a senha, entrou na plataforma).
 */
async function getMemberDelivery(memberId) {
  const [logs, member, link] = await Promise.all([
    postgres.query("SELECT * FROM email_log WHERE member_id = $1 ORDER BY created_at DESC LIMIT 100", [memberId]),
    postgres.query("SELECT password_hash, first_login_at, last_login_at FROM members WHERE id = $1", [memberId]),
    postgres.query(
      "SELECT max(opened_at) AS opened_at FROM access_links WHERE member_id = $1",
      [memberId],
    ),
  ]);
  const row = member.rows[0] || {};
  return {
    emails: logs.rows.map(serializeLog),
    signals: {
      accessLinkOpenedAt: link.rows[0]?.opened_at || null,
      hasPassword: Boolean(row.password_hash),
      firstLoginAt: row.first_login_at || null,
      lastLoginAt: row.last_login_at || null,
    },
  };
}

/**
 * Resumo por aluno para a lista do /adm: o e-mail de acesso saiu? foi aberto?
 * o aluno já entrou? Devolve um Map member_id -> resumo.
 */
async function getDeliverySummaries() {
  const result = await postgres.query(`
    SELECT m.id, m.first_login_at,
           a.status AS access_status, a.created_at AS access_sent_at, a.opened_at AS access_opened_at,
           (SELECT count(*)::int FROM email_log f WHERE f.member_id = m.id AND f.status = 'failed') AS failed,
           (SELECT count(*)::int FROM email_log s WHERE s.member_id = m.id AND s.status = 'sent') AS sent
    FROM members m
    LEFT JOIN LATERAL (
      SELECT status, created_at, opened_at FROM email_log
      WHERE member_id = m.id AND kind = 'access'
      ORDER BY created_at DESC LIMIT 1
    ) a ON TRUE
    WHERE m.is_platform_admin = FALSE
  `);
  return new Map(
    result.rows.map((row) => [
      row.id,
      {
        accessStatus: row.access_status || null,
        accessSentAt: row.access_sent_at || null,
        accessOpenedAt: row.access_opened_at || null,
        firstLoginAt: row.first_login_at || null,
        sent: row.sent,
        failed: row.failed,
      },
    ]),
  );
}

module.exports = {
  KIND_LABELS,
  publicApiUrl,
  startLog,
  finishLog,
  markOpened,
  getMemberDelivery,
  getDeliverySummaries,
};
