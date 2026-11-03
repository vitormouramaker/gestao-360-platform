const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { postgres } = require("../server/connect");
const { sendResetPasswordEmail } = require("../server/email");
const { verifyToken } = require("../middlewares/auth.middleware");
const { ensureSchema } = require("../services/migrations.service");
const { buildAuthUser, issueAuthTokens } = require("../services/auth-session.service");
const {
  findUsableSession,
  revokeSessionByToken,
  revokeAllSessions,
  getTokensValidFrom,
} = require("../services/session.service");
const { createSetupToken, getResetTokenSecret, isAccessActive } = require("../services/access.service");
const { resolveAccessLink } = require("../services/access-links.service");
const { JWT_REFRESH_SECRET } = require("../config/jwt");

// Assinatura cancelada, reembolsada ou em atraso: o cadastro fica, o acesso não.
const ACCESS_SUSPENDED = {
  code: "ACCESS_SUSPENDED",
  message: "Seu acesso está suspenso. Regularize a assinatura para voltar a entrar.",
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// O acesso é criado na compra do Gestão 360°: não existe cadastro aberto.
router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ message: "Email e senha sao obrigatorios." });
  }

  try {
    await ensureSchema();
    const result = await postgres.query("SELECT * FROM members WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    const passwordMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    if (!isAccessActive(user)) {
      return res.status(403).json(ACCESS_SUSPENDED);
    }

    const { token, refreshToken } = await issueAuthTokens(user, { req });
    // Para a equipe ver no /adm que o aluno já entrou na plataforma.
    postgres
      .query(
        "UPDATE members SET first_login_at = COALESCE(first_login_at, CURRENT_TIMESTAMP), last_login_at = CURRENT_TIMESTAMP WHERE id = $1",
        [user.id],
      )
      .catch(() => undefined);

    res.json({
      message: "Login realizado com sucesso",
      token,
      refreshToken,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token nao fornecido." });
  }

  let payload;

  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Refresh token invalido ou expirado." });
  }

  if (!payload || payload.type !== "refresh" || !payload.id) {
    return res.status(401).json({ message: "Refresh token invalido." });
  }

  try {
    // Sessão encerrada (logout, troca de senha, "sair de todos os dispositivos")
    // não renova mais.
    const { session } = await findUsableSession(refreshToken);
    if (!session) {
      return res
        .status(401)
        .json({ message: "Sessão encerrada. Faça login novamente.", code: "SESSION_REVOKED" });
    }

    const validFromEpoch = await getTokensValidFrom(payload.id);
    if (validFromEpoch && payload.iat && payload.iat < validFromEpoch) {
      return res
        .status(401)
        .json({ message: "Sessão encerrada. Faça login novamente.", code: "SESSION_REVOKED" });
    }

    const result = await postgres.query("SELECT * FROM members WHERE id = $1", [payload.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }

    if (!isAccessActive(user)) {
      return res.status(401).json(ACCESS_SUSPENDED);
    }

    const tokens = await issueAuthTokens(user, { req });
    // Um refresh token só serve uma vez: o antigo é encerrado depois da troca.
    await revokeSessionByToken(refreshToken, { rotated: true });

    return res.json({
      message: "Sessao renovada com sucesso.",
      ...tokens,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Erro ao renovar sessao:", error);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Dados atuais de quem está logado (o plano pode ter mudado desde o login).
router.get("/me", verifyToken, async (req, res) => {
  try {
    const result = await postgres.query("SELECT * FROM members WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Usuario da sessao nao encontrado." });
    }

    // A tela confere a sessão a cada minuto por aqui: assinatura suspensa
    // encerra o acesso de quem já estava dentro.
    if (!isAccessActive(user)) {
      return res
        .status(401)
        .json({ ...ACCESS_SUSPENDED, code: "SESSION_REVOKED", reason: ACCESS_SUSPENDED.code });
    }

    res.json({ user: buildAuthUser(user) });
  } catch (error) {
    console.error("Erro ao carregar a sessao:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ message: "Email e obrigatorio." });
  }

  // Resposta sempre igual, para não revelar se o e-mail está cadastrado: nem no
  // texto, nem no status, nem no tempo. Falha de envio e erro interno ficam só
  // no log; o visitante recebe sempre o mesmo 200.
  const resposta = {
    message: "Se o e-mail existir em nossa base, instrucoes de recuperacao serao enviadas.",
  };

  try {
    await ensureSchema();
    const result = await postgres.query("SELECT * FROM members WHERE email = $1", [email]);
    const user = result.rows[0];

    if (user) {
      const resetToken = jwt.sign(
        { id: user.id, reset: true },
        getResetTokenSecret(user.password_hash),
        { expiresIn: "1h" },
      );
      // Envio em segundo plano: a resposta não espera o SMTP, então o tempo é o
      // mesmo para e-mail cadastrado ou não.
      sendResetPasswordEmail(user.email, resetToken, { memberId: user.id, kind: "reset_password" })
        .then((sent) => {
          if (!sent) console.error("[senha] e-mail de recuperação não saiu para", user.id);
        })
        .catch((error) => console.error("[senha] falha ao enviar recuperação", error?.message || error));
    }

    res.json(resposta);
  } catch (error) {
    console.error("Erro na recuperacao de senha:", error);
    // Mesmo em erro interno, resposta genérica: um 500 só para e-mail existente
    // também seria um sinal de que o cadastro existe.
    res.json(resposta);
  }
});

// Link curto de primeiro acesso: devolve o token da tela de criar a senha.
router.get("/access-link/:code", async (req, res) => {
  try {
    await ensureSchema();
    const member = await resolveAccessLink(req.params.code);
    res.json({ token: createSetupToken(member), name: member.name });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Erro ao abrir o link de acesso:", error);
    res.status(500).json({ message: "Não foi possível abrir o link de acesso." });
  }
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ message: "Token e nova senha sao obrigatorios." });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: "A nova senha deve ter pelo menos 8 caracteres." });
  }

  try {
    const decoded = jwt.decode(token);
    if (!decoded?.reset || !decoded?.id) {
      return res.status(400).json({ message: "Token de redefinicao invalido." });
    }

    const memberResult = await postgres.query(
      "SELECT id, password_hash FROM members WHERE id = $1",
      [decoded.id],
    );

    if (memberResult.rows.length === 0) {
      return res.status(400).json({ message: "O link de redefinicao e invalido ou expirou." });
    }

    const member = memberResult.rows[0];
    jwt.verify(token, getResetTokenSecret(member.password_hash));

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await postgres.query(
      `
        UPDATE members
        SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND password_hash IS NOT DISTINCT FROM $3
        RETURNING id
      `,
      [passwordHash, member.id, member.password_hash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "O link de redefinicao e invalido ou expirou." });
    }

    // Senha nova derruba os acessos que já estavam abertos.
    await revokeAllSessions(member.id);

    res.json({ message: "Senha redefinida com sucesso." });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(400).json({ message: "O link de redefinicao e invalido ou expirou." });
    }

    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ message: "Erro interno no servidor ao redefinir a senha." });
  }
});

// Sair deste dispositivo: encerra a sessão do refresh token enviado.
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body || {};

  try {
    if (refreshToken) {
      await revokeSessionByToken(refreshToken);
    }
    return res.json({ message: "Sessão encerrada." });
  } catch (error) {
    console.error("Erro ao encerrar a sessão:", error);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Sair de todos os dispositivos: encerra todas as sessões e derruba os acessos
// já abertos (tokens emitidos antes de agora deixam de valer).
router.post("/logout-all", verifyToken, async (req, res) => {
  try {
    const revoked = await revokeAllSessions(req.user.id);
    return res.json({ message: "Todas as sessões foram encerradas.", revoked });
  } catch (error) {
    console.error("Erro ao encerrar as sessões:", error);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
