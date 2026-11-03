const { postgres } = require("../server/connect");
const { sendAdminAccessEmail } = require("../server/email");
const { createId } = require("../utils/ids");
const { createAccessLink } = require("./access-links.service");
const { ADMIN_AREAS, normalizePermissions, readAdmin } = require("./admin-permissions.service");
const { revokeAllSessions } = require("./session.service");
const { ValidationError, readText } = require("./tracking.service");

/**
 * Equipe da Gestão 360: quem administra a plataforma pelo /adm. Só o master cuida da
 * equipe. Um administrador é criado com nome, e-mail e as áreas que pode usar;
 * ele recebe o link de primeiro acesso por e-mail (e o master também vê o
 * link, para mandar por outro canal) e cria a própria senha. Não depende de
 * assinatura nem recebe acessos nas outras plataformas.
 */

class TeamError extends Error {
  constructor(message, status = 400, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}


/** Link curto de primeiro acesso: leva à tela de criar a senha, válido por 7 dias. */
function setupUrl(admin) {
  return createAccessLink(admin);
}

function serializeAdmin(row, currentId) {
  const { role, permissions } = readAdmin(row);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    permissions,
    hasPassword: Boolean(row.password_hash),
    accessSentAt: row.welcome_sent_at,
    createdAt: row.created_at,
    isYou: row.id === currentId,
  };
}

function readPermissions(value) {
  const permissions = normalizePermissions(value);
  if (permissions.length === 0) {
    throw new ValidationError("Marque pelo menos uma área que o administrador pode usar.", "permissions");
  }
  return permissions;
}

async function listAdmins(currentId) {
  const result = await postgres.query(
    "SELECT * FROM members WHERE is_platform_admin = TRUE ORDER BY (admin_role = 'master') DESC, name ASC",
  );
  return {
    admins: result.rows.map((row) => serializeAdmin(row, currentId)),
    areas: Object.entries(ADMIN_AREAS).map(([key, area]) => ({ key, ...area })),
  };
}

/** Manda o e-mail de primeiro acesso e devolve o link (o master também o vê). */
async function sendAccess(admin) {
  const url = await setupUrl(admin);
  const sent = await sendAdminAccessEmail({
    to: admin.email,
    name: admin.name,
    url,
    track: { memberId: admin.id, kind: "admin_access", manual: true },
  });
  if (sent) {
    await postgres.query("UPDATE members SET welcome_sent_at = CURRENT_TIMESTAMP WHERE id = $1", [admin.id]);
  }
  return { sent, url };
}

async function createAdmin(body = {}, currentId) {
  const name = readText(body.name, { field: "name", label: "o nome", max: 255, required: true });
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new ValidationError("Informe um e-mail válido.", "email");
  }
  const permissions = readPermissions(body.permissions);

  const existing = await postgres.query("SELECT id, is_platform_admin FROM members WHERE email = $1", [email]);
  if (existing.rows[0]) {
    // Um aluno não vira administrador por aqui: o acesso dele depende da
    // assinatura e misturar os dois papéis confunde relatórios e e-mails.
    throw new TeamError(
      existing.rows[0].is_platform_admin
        ? "Este e-mail já é de um administrador."
        : "Este e-mail já é de um aluno. Use outro e-mail para o acesso de administrador.",
      409,
      "email",
    );
  }

  const inserted = await postgres.query(
    `
      INSERT INTO members (id, name, email, avatar_color, plan, plan_status, is_platform_admin, admin_role, admin_permissions)
      VALUES ($1, $2, $3, 'bg-slate-700', 'premium', 'active', TRUE, 'admin', $4)
      ON CONFLICT (email) DO NOTHING
      RETURNING *
    `,
    [createId("user"), name, email, permissions.join(",")],
  );
  const admin = inserted.rows[0];
  if (!admin) throw new TeamError("Este e-mail acabou de ser cadastrado. Atualize a página.", 409, "email");

  const { sent, url } = await sendAccess(admin);
  return {
    admin: serializeAdmin({ ...admin, welcome_sent_at: sent ? new Date() : null }, currentId),
    setupUrl: url,
    message: sent
      ? `Administrador criado. ${email} recebeu o e-mail com o link de primeiro acesso.`
      : "Administrador criado, mas o e-mail não saiu. Copie o link de primeiro acesso e mande para ele.",
  };
}

async function findAdmin(adminId) {
  const result = await postgres.query("SELECT * FROM members WHERE id = $1 AND is_platform_admin = TRUE", [adminId]);
  if (!result.rows[0]) throw new TeamError("Administrador não encontrado.", 404);
  return result.rows[0];
}

/** Nome e áreas de um administrador. O master não muda por aqui. */
async function updateAdmin(adminId, body = {}, currentId) {
  const admin = await findAdmin(adminId);
  if (readAdmin(admin).role === "master") {
    throw new TeamError("As permissões do administrador master não podem ser alteradas.");
  }

  const name =
    body.name !== undefined
      ? readText(body.name, { field: "name", label: "o nome", max: 255, required: true })
      : admin.name;
  const permissions =
    body.permissions !== undefined ? readPermissions(body.permissions) : readAdmin(admin).permissions;

  const updated = await postgres.query(
    "UPDATE members SET name = $2, admin_permissions = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
    [adminId, name, permissions.join(",")],
  );
  return { admin: serializeAdmin(updated.rows[0], currentId), message: "Administrador atualizado." };
}

async function resendAdminAccess(adminId) {
  const admin = await findAdmin(adminId);
  const { sent, url } = await sendAccess(admin);
  return {
    setupUrl: url,
    message: sent
      ? `Novo link de acesso enviado para ${admin.email}.`
      : "O e-mail não saiu, mas o link novo está pronto para você copiar e mandar.",
  };
}

/**
 * Tira o acesso de administrador: o cadastro fica (histórico de revisões e
 * atendimentos aponta para ele), mas não entra mais e as sessões abertas caem.
 */
async function removeAdmin(adminId, currentId) {
  if (adminId === currentId) {
    throw new TeamError("Você não pode remover o seu próprio acesso.");
  }
  const admin = await findAdmin(adminId);
  if (readAdmin(admin).role === "master") {
    throw new TeamError("O administrador master não pode ser removido por aqui.");
  }

  await postgres.query(
    `
      UPDATE members
      SET is_platform_admin = FALSE, admin_role = NULL, admin_permissions = NULL,
          plan_status = 'suspended', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
    [adminId],
  );
  await revokeAllSessions(adminId);
  return `Acesso de ${admin.name} removido.`;
}

module.exports = {
  TeamError,
  listAdmins,
  createAdmin,
  updateAdmin,
  resendAdminAccess,
  removeAdmin,
};
