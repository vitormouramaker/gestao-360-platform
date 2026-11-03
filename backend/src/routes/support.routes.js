const express = require("express");
const router = express.Router();
const { postgres } = require("../server/connect");
const { verifyToken } = require("../middlewares/auth.middleware");
const { generateSupportReply, isAgentConfigured } = require("../services/agent.service");
const { getCatalogForMember } = require("../services/catalog.service");
const { getKnowledgeForSupport } = require("../services/knowledge.service");
const { ensureSchema } = require("../services/migrations.service");
const { getMemberPlans, reviewDueAt } = require("../services/plan.service");
const { planIncludes } = require("../services/plans.service");
const { getSettings, isSupportOpen, whatsappUrl } = require("../services/settings.service");
const { SUPPORT_FLAGS } = require("../services/support-insights.service");
const {
  cancelTicket,
  getOpenTicket,
  openTicket,
  ticketForMember,
} = require("../services/support-tickets.service");
const { describeTools, getToolsForPlan } = require("../services/tools.service");
const { EVENT_TYPES, readText, sendError } = require("../services/tracking.service");
const { sendSupportAlertEmail } = require("../server/email");
const { createId } = require("../utils/ids");

// Resposta quando a IA não está ligada ou falhou: o cliente recebe as opções
// para falar com o time humano.
const FALLBACK_REPLY =
  "Não consegui responder agora. Tente de novo em alguns instantes ou fale com o nosso time pelas opções abaixo.";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function serializeMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    // true = a resposta orienta a falar com o time humano (o chat mostra o botão).
    handoff: Boolean(row.handoff),
    createdAt: row.created_at,
  };
}

async function addMessage(memberId, role, content, { resolves = false, handoff = false, ticketId = null } = {}) {
  const result = await postgres.query(
    "INSERT INTO support_messages (id, member_id, role, content, resolves, handoff, ticket_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [createId("msg"), memberId, role, content, resolves, handoff, ticketId],
  );
  return result.rows[0];
}

/**
 * Guarda a marca de uso indevido na mensagem do cliente e, nos casos graves,
 * avisa a equipe por e-mail (no máximo um aviso por cliente por hora).
 */
async function flagMessage(message, category) {
  const flag = SUPPORT_FLAGS[category];
  if (!flag) return;

  await postgres.query("UPDATE support_messages SET flag = $1 WHERE id = $2", [category, message.id]);
  if (!flag.severe) return;

  const [recent, member, settings] = await Promise.all([
    postgres.query(
      `
        SELECT 1 FROM support_messages
        WHERE member_id = $1 AND id <> $2 AND flag = ANY($3)
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
        LIMIT 1
      `,
      [
        message.member_id,
        message.id,
        Object.keys(SUPPORT_FLAGS).filter((key) => SUPPORT_FLAGS[key].severe),
      ],
    ),
    postgres.query("SELECT name, email FROM members WHERE id = $1", [message.member_id]),
    getSettings(),
  ]);
  if (recent.rows.length > 0) return;

  // O destino é definido no /adm, em Configurações.
  const recipients = settings.supportAlertEmail
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0) return;

  await sendSupportAlertEmail({
    to: recipients.join(", "),
    memberName: member.rows[0]?.name || "Cliente",
    memberEmail: member.rows[0]?.email || "",
    flagLabel: flag.label,
    content: message.content,
  });
}

/**
 * O que o assistente sabe sobre quem está perguntando: plano, entregáveis,
 * calendário e situação do diagnóstico. Só entra o que o cliente já pode ver.
 */
async function buildSupportFacts(memberId, settings) {
  const [catalog, plans, events, member] = await Promise.all([
    getCatalogForMember(memberId),
    getMemberPlans(memberId),
    postgres.query(
      "SELECT * FROM events WHERE starts_at >= CURRENT_TIMESTAMP ORDER BY starts_at ASC LIMIT 10",
    ),
    postgres.query("SELECT name FROM members WHERE id = $1", [memberId]),
  ]);

  const deliverables = (catalog?.products || []).map((product) => {
    const where = product.locked
      ? "bloqueado, faz parte da Assinatura Anual"
      : product.page
        ? "abre dentro da plataforma"
        : product.accessUrl
          ? "abre em outra aba pelo card da tela inicial"
          : "sem link no card da tela inicial";
    return `- ${product.name} (${where})`;
  });

  const calendar = events.rows
    .filter((event) => planIncludes(catalog?.plan, event.plan))
    .map(
      (event) =>
        `- ${EVENT_TYPES[event.type] || event.type}: ${event.title}, ${DATA_HORA.format(event.starts_at)}${event.location ? `, em ${event.location}` : ""}`,
    );

  let diagnosis = "A anamnese foi enviada, mas o diagnóstico ainda não entrou na fila.";
  if (plans.approved && plans.pending) {
    diagnosis = `Diagnóstico liberado (ciclo ${plans.approved.cycle}). Há um novo plano em análise, com previsão para ${DATA_HORA.format(reviewDueAt(plans.pending.requested_at))}.`;
  } else if (plans.approved) {
    diagnosis = `Diagnóstico liberado (ciclo ${plans.approved.cycle}).`;
  } else if (plans.pending) {
    diagnosis = `Diagnóstico em análise pelo time, com previsão para ${DATA_HORA.format(reviewDueAt(plans.pending.requested_at))}.`;
  }

  return [
    `Nome: ${member.rows[0]?.name || "não informado"}`,
    `Plano contratado: ${catalog?.planName || "não identificado"}`,
    `Situação do diagnóstico: ${diagnosis}`,
    `Agora: ${DATA_HORA.format(new Date())} (horário de Brasília)`,
    `Atendimento do time humano: ${settings.supportWhatsapp ? "pelo WhatsApp de suporte ou por este chat" : "por este chat"}, ${settings.supportHours}.`,
    `Atendimento da equipe por este chat neste momento: ${isSupportOpen(settings) ? "disponível" : "fora do horário (a opção do chat não aparece; informe o horário)"}`,
    "",
    "Entregáveis:",
    deliverables.join("\n") || "- nenhum",
    "",
    "Próximos eventos do calendário deste cliente:",
    calendar.join("\n") || "- nenhum evento marcado",
    "",
    "Ferramentas e modelos que este cliente pode baixar (menu Ferramentas e modelos):",
    describeTools(await getToolsForPlan(catalog?.plan)) || "- nenhum material publicado ainda",
  ].join("\n");
}

// Conversa de quem está logado com o suporte.
router.get("/messages", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const result = await postgres.query(
      "SELECT * FROM support_messages WHERE member_id = $1 ORDER BY created_at ASC LIMIT 200",
      [req.user.id],
    );
    const [settings, ticket] = await Promise.all([getSettings(), getOpenTicket(req.user.id)]);
    res.json({
      messages: result.rows.map(serializeMessage),
      // Atendimento humano em aberto: enquanto existir, a IA não responde.
      ticket: ticketForMember(ticket),
      // Contato do time humano; null enquanto o número não foi cadastrado.
      whatsappUrl: whatsappUrl(settings.supportWhatsapp),
      supportHours: settings.supportHours,
      // Fora do horário a opção de falar com a equipe pelo chat não aparece.
      chatSupportOpen: isSupportOpen(settings),
    });
  } catch (error) {
    sendError(res, error, "Não foi possível carregar a conversa.");
  }
});

// Body: { content }. Devolve a mensagem gravada e a resposta, quando houver.
router.post("/messages", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const content = readText(req.body?.content, {
      field: "content",
      label: "a mensagem",
      max: 2000,
      required: true,
    });

    const previous = await postgres.query(
      "SELECT role, content FROM support_messages WHERE member_id = $1 ORDER BY created_at ASC LIMIT 200",
      [req.user.id],
    );
    // Em atendimento humano (na fila ou em andamento) a IA fica de fora: a
    // mensagem vai para a pessoa da equipe.
    const ticket = await getOpenTicket(req.user.id);
    if (ticket) {
      const sent = await addMessage(req.user.id, "user", content, { ticketId: ticket.id });
      return res.status(201).json({ message: serializeMessage(sent), reply: null });
    }

    const message = await addMessage(req.user.id, "user", content);

    // Falha da IA nunca vira erro para o cliente: a conversa segue com a equipe.
    let ai = null;
    if (isAgentConfigured()) {
      ai = await getSettings()
        .then((settings) =>
          Promise.all([buildSupportFacts(req.user.id, settings), getKnowledgeForSupport(req.user.id)]),
        )
        .then(([facts, knowledge]) =>
          generateSupportReply({ facts, knowledge, history: previous.rows, message: content }),
        )
        .catch((error) => {
          console.error("[suporte] falha ao gerar resposta", error?.message || error);
          return null;
        });
    }

    if (ai?.category && ai.category !== "normal") {
      // Falha ao marcar ou avisar não pode atrapalhar a resposta ao cliente.
      await flagMessage(message, ai.category).catch((error) =>
        console.error("[suporte] falha ao marcar uso indevido", error?.message || error),
      );
    }

    // Quando a IA não resolve (ou falha), a resposta vem com as opções para
    // falar com o time humano: WhatsApp ou atendimento por este chat.
    const reply = ai?.answer
      ? await addMessage(req.user.id, "assistant", ai.answer, {
          resolves: !ai.escalate,
          handoff: Boolean(ai.escalate),
        })
      : await addMessage(req.user.id, "assistant", FALLBACK_REPLY, { handoff: true });

    res.status(201).json({ message: serializeMessage(message), reply: serializeMessage(reply) });
  } catch (error) {
    sendError(res, error, "Não foi possível enviar a mensagem.");
  }
});

// O cliente pede para falar com a equipe pelo chat e entra na fila.
router.post("/ticket", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    const ticket = await openTicket(req.user.id);
    res.status(201).json({ ticket: ticketForMember(ticket) });
  } catch (error) {
    sendError(res, error, "Não foi possível entrar na fila de atendimento.");
  }
});

// O cliente sai da fila antes de alguém assumir.
router.post("/ticket/cancel", verifyToken, async (req, res) => {
  try {
    await ensureSchema();
    await cancelTicket(req.user.id);
    res.json({ message: "Você saiu da fila." });
  } catch (error) {
    sendError(res, error, "Não foi possível sair da fila.");
  }
});

module.exports = router;
module.exports.serializeMessage = serializeMessage;
module.exports.addMessage = addMessage;
