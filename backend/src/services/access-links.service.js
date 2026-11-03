const crypto = require("crypto");
const { postgres } = require("../server/connect");

/**
 * Link curto de primeiro acesso (e de nova senha): /acesso/K7M2QX9P4T no
 * lugar do link com o token inteiro. O código aponta para o cadastro; ao abrir,
 * a plataforma troca o código pelo token de criar a senha. O link deixa de
 * valer quando a senha muda (o código guarda uma marca da senha da época) ou
 * depois de 7 dias.
 */

const LINK_DAYS = 7;
// Sem 0/O e 1/I/L, para ninguém errar ao digitar.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

class AccessLinkError extends Error {
  constructor(message, status = 410) {
    super(message);
    this.status = status;
  }
}

function frontendUrl() {
  return String(process.env.FRONTEND_URL || "http://localhost:5180").replace(/\/+$/, "");
}

/** Marca da senha atual: muda quando a senha é criada ou trocada. */
function passwordMark(passwordHash) {
  return crypto.createHash("sha256").update(String(passwordHash || "sem-senha")).digest("hex");
}

function createCode() {
  let code = "";
  for (const byte of crypto.randomBytes(CODE_LENGTH)) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** Cria o link curto para o cadastro. Devolve o endereço completo. */
async function createAccessLink(member) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();
    const inserted = await postgres.query(
      `
        INSERT INTO access_links (code, member_id, password_mark, expires_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(days => $4))
        ON CONFLICT (code) DO NOTHING
        RETURNING code
      `,
      [code, member.id, passwordMark(member.password_hash), LINK_DAYS],
    );
    if (inserted.rows[0]) return `${frontendUrl()}/acesso/${code}`;
  }
  throw new Error("Não foi possível gerar o link de acesso.");
}

/** Troca o código pelo cadastro, se o link ainda vale. */
async function resolveAccessLink(rawCode) {
  const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== CODE_LENGTH) throw new AccessLinkError("Link de acesso inválido.", 404);

  const result = await postgres.query(
    `
      SELECT l.expires_at, l.password_mark, m.*
      FROM access_links l
      INNER JOIN members m ON m.id = l.member_id
      WHERE l.code = $1
    `,
    [code],
  );
  const row = result.rows[0];
  if (!row) throw new AccessLinkError("Link de acesso inválido.", 404);
  if (new Date(row.expires_at) < new Date()) {
    throw new AccessLinkError("Este link expirou. Peça um novo ou use \"Esqueceu a senha?\" na tela de acesso.");
  }
  if (row.password_mark !== passwordMark(row.password_hash)) {
    throw new AccessLinkError("Este link já foi usado. Entre com o seu e-mail e a senha criada.");
  }
  // Para a equipe ver no /adm que o aluno chegou a abrir o link.
  await postgres
    .query("UPDATE access_links SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP) WHERE code = $1", [code])
    .catch(() => undefined);
  return row;
}

/** Remove links vencidos há mais de 30 dias. */
async function purgeAccessLinks() {
  await postgres.query("DELETE FROM access_links WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days'");
}

module.exports = {
  AccessLinkError,
  createAccessLink,
  resolveAccessLink,
  purgeAccessLinks,
};
