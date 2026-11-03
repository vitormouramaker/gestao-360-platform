const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");
const { MATRIX_VERSION, PUBLIC_QUESTIONS, QUESTIONS: MATRIX_QUESTIONS } = require("./anamnese-matrix");
const { ensureSchema } = require("./migrations.service");

/**
 * Anamnese empresarial: o que o cliente responde no primeiro acesso.
 *
 * Fluxo: responde (pode salvar rascunho e voltar) -> envia -> nasce um plano
 * na fila de revisão da equipe (ver plan.service).
 *
 * As perguntas vêm da Matriz Operacional (anamnese-matrix.js). Para a tela só
 * vai a parte pública: pergunta e opções, sem pilar nem pontuação.
 */
const QUESTIONS = PUBLIC_QUESTIONS;
const QUESTIONS_VERSION = `matriz-${MATRIX_VERSION}`;

const MAX_TEXT_LENGTH = 200;
const MAX_LONG_TEXT_LENGTH = 2000;

class DiagnosticError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/** Uma resposta no formato esperado pelo tipo da pergunta, ou null se vazia ou inválida. */
function readAnswer(question, raw) {
  if (question.type === "multi") {
    const selected = [...new Set((Array.isArray(raw) ? raw : []).filter((item) => question.options.includes(item)))];
    if (selected.length === 0) return null;
    // "Nenhum" marcado junto com outra opção não faz sentido: vale o que foi marcado de fato.
    if (question.exclusiveOption && selected.length > 1) {
      return selected.filter((item) => item !== question.exclusiveOption);
    }
    return selected;
  }

  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (question.type === "select") {
    return question.options.includes(value) ? value : null;
  }
  if (question.type === "phone") {
    // Com DDD: de 10 a 13 dígitos (aceita o 55 na frente).
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 13 ? value.slice(0, 30) : null;
  }
  if (question.type === "moeda" || question.type === "percentual") {
    // "Não sei informar" / "Não possuo meta definida" fica guardado como escolhido.
    if (question.emptyOption && value === question.emptyOption) return value;
    // Valor numérico: só dígitos e separadores; sem completar com zero quando vazio.
    const numero = value.replace(/[^\d.,]/g, "").slice(0, 20);
    return /\d/.test(numero) ? numero : null;
  }
  return value.slice(0, question.type === "textarea" ? MAX_LONG_TEXT_LENGTH : MAX_TEXT_LENGTH);
}

/**
 * Lê as respostas recebidas guardando só o que é esperado. Nada é completado
 * por conta própria: pergunta sem resposta fica de fora, e respostas como
 * "Não sei" e "Não acompanho" são preservadas exatamente como foram escolhidas.
 */
function readAnswers(input) {
  const source = input && typeof input === "object" ? input : {};
  const answers = {};

  for (const question of MATRIX_QUESTIONS) {
    const answer = readAnswer(question, source[question.id]);
    if (answer !== null) answers[question.id] = answer;
  }

  return answers;
}

function assertComplete(answers, source) {
  const missing = MATRIX_QUESTIONS.find(
    (question) => !question.optional && answers[question.id] === undefined,
  );
  if (!missing) return;

  // Telefone preenchido, mas fora do formato: a mensagem diz o que corrigir.
  if (missing.type === "phone" && String(source?.[missing.id] ?? "").trim()) {
    throw new DiagnosticError(400, "Informe o WhatsApp com DDD.", missing.id);
  }
  throw new DiagnosticError(400, `Responda: ${missing.label}`, missing.id);
}

function serializeDiagnostic(row) {
  if (!row) return null;

  return {
    id: row.id,
    // draft = respondendo; submitted = enviado.
    status: row.status,
    answers: row.answers || {},
    submittedAt: row.status === "submitted" ? row.submitted_at : null,
    updatedAt: row.updated_at,
  };
}

async function getMemberDiagnostic(memberId) {
  await ensureSchema();
  const result = await postgres.query("SELECT * FROM diagnostics WHERE member_id = $1", [memberId]);
  return result.rows[0] || null;
}

/** Guarda o que já foi respondido, sem exigir que esteja completo. */
async function saveDraft(memberId, rawAnswers) {
  await ensureSchema();
  const answers = readAnswers(rawAnswers);

  const result = await postgres.query(
    `
      INSERT INTO diagnostics (id, member_id, answers, status, questions_version)
      VALUES ($1, $2, $3, 'draft', $4)
      ON CONFLICT (member_id) DO UPDATE SET
        answers = EXCLUDED.answers,
        questions_version = EXCLUDED.questions_version,
        updated_at = CURRENT_TIMESTAMP
      WHERE diagnostics.status = 'draft'
      RETURNING *
    `,
    [createId("diag"), memberId, JSON.stringify(answers), QUESTIONS_VERSION],
  );

  if (result.rows.length === 0) {
    throw new DiagnosticError(409, "Sua anamnese já foi enviada.");
  }
  return result.rows[0];
}

// Os Indicadores do Negócio (faturamento, margem, metas, ticket): únicos campos
// que a equipe preenche/edita pelo perfil do aluno no /adm.
const INDICATOR_QUESTIONS = MATRIX_QUESTIONS.filter((q) => q.type === "moeda" || q.type === "percentual");

/**
 * A equipe preenche ou corrige os Indicadores do Negócio de um aluno (quando ele
 * deixou em branco na anamnese, ou após uma call de hot seat). Só mexe nesses
 * campos; o resto das respostas e o status da anamnese ficam intactos.
 */
async function saveMemberIndicators(memberId, rawAnswers) {
  await ensureSchema();
  const source = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};

  const patch = {};
  for (const question of INDICATOR_QUESTIONS) {
    if (!(question.id in source)) continue;
    // null = limpar o campo. Nada é completado com zero por conta própria.
    patch[question.id] = readAnswer(question, source[question.id]);
  }

  const current = await postgres.query("SELECT * FROM diagnostics WHERE member_id = $1", [memberId]);
  if (current.rows.length === 0) {
    throw new DiagnosticError(409, "O aluno ainda não tem anamnese para preencher os indicadores.");
  }

  const answers = { ...(current.rows[0].answers || {}) };
  for (const [id, value] of Object.entries(patch)) {
    if (value === null) delete answers[id];
    else answers[id] = value;
  }

  const updated = await postgres.query(
    "UPDATE diagnostics SET answers = $1, updated_at = CURRENT_TIMESTAMP WHERE member_id = $2 RETURNING *",
    [JSON.stringify(answers), memberId],
  );
  return serializeDiagnostic(updated.rows[0]);
}

/**
 * Envio definitivo. Na mesma transação nasce o plano do primeiro ciclo, já na
 * fila de revisão da equipe.
 */
async function submitDiagnostic(memberId, rawAnswers) {
  await ensureSchema();
  const answers = readAnswers(rawAnswers);
  assertComplete(answers, rawAnswers);

  // O WhatsApp da anamnese completa o cadastro de quem ainda não tem telefone.
  const { normalizePhone } = require("../utils/phone");
  const phone = normalizePhone(answers.q03);
  if (phone) {
    await postgres
      .query("UPDATE members SET phone = $2 WHERE id = $1 AND phone IS NULL", [memberId, phone])
      .catch(() => undefined);
  }

  // Importado aqui para evitar dependência circular com plan.service.
  const { createPendingPlan } = require("./plan.service");
  const client = await postgres.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        INSERT INTO diagnostics (id, member_id, answers, status, questions_version, submitted_at)
        VALUES ($1, $2, $3, 'submitted', $4, CURRENT_TIMESTAMP)
        ON CONFLICT (member_id) DO UPDATE SET
          answers = EXCLUDED.answers,
          status = 'submitted',
          questions_version = EXCLUDED.questions_version,
          submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE diagnostics.status = 'draft'
        RETURNING *
      `,
      [createId("diag"), memberId, JSON.stringify(answers), QUESTIONS_VERSION],
    );

    if (result.rows.length === 0) {
      throw new DiagnosticError(409, "Sua anamnese já foi enviada.");
    }

    await createPendingPlan(client, memberId, { answers });
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  QUESTIONS,
  QUESTIONS_VERSION,
  DiagnosticError,
  serializeDiagnostic,
  getMemberDiagnostic,
  saveDraft,
  saveMemberIndicators,
  submitDiagnostic,
};
