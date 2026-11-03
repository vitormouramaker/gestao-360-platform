const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/jwt');
const { postgres } = require('../server/connect');
const { isAccessActive } = require('../services/access.service');
const { getTokensValidFrom } = require('../services/session.service');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  let verified;
  try {
    verified = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(403).json({ message: 'Token inválido ou expirado.' });
  }

  // "Sair de todos os dispositivos" e troca de senha marcam a hora a partir da
  // qual os acessos já abertos param de valer.
  try {
    const validFromEpoch = await getTokensValidFrom(verified.id);
    if (validFromEpoch && verified.iat && verified.iat < validFromEpoch) {
      // Quando a sessão caiu porque a assinatura foi suspensa, a tela de acesso
      // mostra esse motivo em vez de um "faça login novamente" que não adiantaria.
      const member = await postgres.query(
        'SELECT plan_status, is_platform_admin FROM members WHERE id = $1',
        [verified.id],
      );
      if (member.rows[0] && !isAccessActive(member.rows[0])) {
        return res.status(401).json({
          message: 'Seu acesso está suspenso. Regularize a assinatura para voltar a entrar.',
          code: 'SESSION_REVOKED',
          reason: 'ACCESS_SUSPENDED',
        });
      }
      return res
        .status(401)
        .json({ message: 'Sessão encerrada. Faça login novamente.', code: 'SESSION_REVOKED' });
    }
  } catch (error) {
    // Falha de banco não pode derrubar o sistema inteiro: segue com o token válido.
    console.error('[auth] falha ao checar sessões encerradas', error?.message || error);
  }

  req.user = verified;
  next();
};

module.exports = {
  verifyToken
};
