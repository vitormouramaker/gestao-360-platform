const { readAdmin } = require("./admin-permissions.service");
const jwt = require("jsonwebtoken");
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} = require("../config/jwt");
const { createSessionId, registerSession } = require("./session.service");
const { normalizePlan, PLANS } = require("./plans.service");

/**
 * Cria os tokens da sessão e registra a sessão no banco, para que seja possível
 * encerrá-la depois ("sair" de verdade e "sair de todos os dispositivos").
 */
async function issueAuthTokens(user, { req = null } = {}) {
  const sessionId = createSessionId();

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: normalizePlan(user.plan),
      sid: sessionId,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: "refresh", sid: sessionId },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  );

  const decoded = jwt.decode(refreshToken);
  await registerSession({
    sessionId,
    memberId: user.id,
    refreshToken,
    expiresAt: new Date(decoded.exp * 1000),
    req,
  });

  return { token, refreshToken, sessionId };
}

function buildAuthUser(user) {
  const plan = normalizePlan(user.plan);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.avatar_color,
    avatarUrl: user.avatar_url || null,
    plan,
    planName: PLANS[plan].name,
    planStatus: user.plan_status,
    isPlatformAdmin: Boolean(user.is_platform_admin),
    // Só para a equipe: master vê tudo; os demais, as áreas de adminPermissions.
    adminRole: user.is_platform_admin ? readAdmin(user).role : null,
    adminPermissions: user.is_platform_admin ? readAdmin(user).permissions : [],
  };
}

module.exports = { issueAuthTokens, buildAuthUser };
