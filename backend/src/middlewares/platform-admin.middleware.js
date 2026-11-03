const { postgres } = require("../server/connect");
const { canAccess, readAdmin } = require("../services/admin-permissions.service");
const { ensureSchema } = require("../services/migrations.service");

/**
 * Só a equipe da Gestão 360 entra no painel de administração, e cada administrador
 * só nas áreas que tem permissão (o master, em todas). A checagem é feita no
 * banco a cada requisição: tirar o acesso ou uma permissão vale na hora, sem
 * esperar o token expirar.
 */
async function requirePlatformAdmin(req, res, next) {
  let row;
  try {
    await ensureSchema();
    const result = await postgres.query(
      "SELECT is_platform_admin, admin_role, admin_permissions FROM members WHERE id = $1",
      [req.user?.id],
    );
    row = result.rows[0];
  } catch (error) {
    console.error("[adm] falha ao checar permissão", error?.message || error);
  }

  if (row?.is_platform_admin !== true) {
    return res.status(403).json({ message: "Acesso restrito à equipe da Gestão 360." });
  }

  const admin = readAdmin(row);
  // Caminho relativo ao roteador do /api/admin.
  if (!canAccess(admin, req.method, req.path)) {
    return res.status(403).json({
      message: "Você não tem permissão para esta área. Fale com o administrador master.",
      code: "ADMIN_PERMISSION",
    });
  }

  req.admin = admin;
  return next();
}

module.exports = { requirePlatformAdmin };
