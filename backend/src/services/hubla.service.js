const crypto = require("crypto");
const { postgres } = require("../server/connect");
const { createId } = require("../utils/ids");
const { applyEntitlement, sendWelcomeOnce } = require("./access.service");
const { normalizePhone } = require("../utils/phone");
const { normalizeDocument } = require("../utils/document");
const { sendGuideOnceSafely } = require("./member-emails.service");
const { syncMemberSafely } = require("./provisioning.service");
const { syncMemberTicketsSafely } = require("./credenciamento.service");
const { ensureSchema } = require("./migrations.service");

/**
 * Avisos (webhooks) da Hubla, onde o Gestão 360° é vendido.
 *
 * A fonte da verdade do acesso é a Hubla: acesso concedido libera a plataforma
 * e acesso removido suspende. Todo aviso recebido fica gravado em
 * hubla_events, inclusive os que não geram ação, para conferência no /adm.
 *
 * Formato conferido com os testes enviados pelo painel da Hubla em 09/10/2026
 * (versão 2.0.0): { type, version, event: { user, products: [{ offers: [{ id }] }], ... } }.
 * A leitura continua tolerante a variações: se o caminho esperado não existir,
 * procura o e-mail e a oferta no corpo todo.
 */

// Ofertas do produto "Gestão 360" na Hubla -> plano na plataforma.
// Sem o id da oferta no .env, nenhuma compra é reconhecida como aquele plano.
function getOfferPlans() {
  const offers = [
    [process.env.HUBLA_OFFER_ESSENCIAL, "essencial"],
    [process.env.HUBLA_OFFER_PREMIUM, "premium"],
  ];
  return Object.fromEntries(
    offers.map(([id, plan]) => [String(id || "").trim(), plan]).filter(([id]) => id),
  );
}

// Avisos que liberam o acesso: acesso concedido, assinatura ativa, fatura paga.
const GRANT_PATTERN = /^(customer\.member_added|subscription\.activated|invoice\.payment_succeeded)$/i;
// Avisos que tiram o acesso: acesso removido, assinatura desativada, fatura reembolsada.
const REVOKE_PATTERN = /^(customer\.member_removed|subscription\.(deactivated|expired)|invoice\.refunded)$/i;

function isWebhookConfigured() {
  return Boolean(String(process.env.HUBLA_WEBHOOK_TOKEN || "").trim());
}

/** Confere o token que a Hubla manda no cabeçalho, sem vazar tempo de comparação. */
function isValidToken(received) {
  const expected = Buffer.from(String(process.env.HUBLA_WEBHOOK_TOKEN || "").trim());
  const given = Buffer.from(String(received || "").trim());
  return expected.length > 0 && expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function getPath(source, path) {
  return path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Primeiro objeto, em qualquer profundidade, que tenha um campo "email" válido. */
function findPersonDeep(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return null;
  if (!Array.isArray(value) && isEmail(value.email)) return value;
  for (const child of Object.values(value)) {
    const found = findPersonDeep(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Quem recebe o acesso: event.user. As faturas trazem outros e-mails no corpo
 * (a própria Hubla e o vendedor, em "receivers"), por isso a busca livre só
 * entra se nenhum dos caminhos conhecidos existir.
 */
function readBuyer(payload) {
  const candidates = ["event.user", "event.payer", "event.subscription.payer", "event.invoice.payer", "user"];
  const person =
    candidates.map((path) => getPath(payload, path)).find((item) => item && isEmail(item.email)) ||
    findPersonDeep(payload);

  if (!person) return { email: null, name: null, phone: null, document: null };

  const name =
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.fullName ||
    person.name ||
    null;
  return {
    email: person.email.trim().toLowerCase(),
    name: name ? String(name).trim() : null,
    phone: normalizePhone(person.phone || person.phoneNumber || person.cellphone || person.mobile),
    document: normalizeDocument(person.document || person.cpf || person.cnpj),
  };
}

/** Qual oferta nossa veio no aviso: event.products[].offers[].id. */
function readOffer(payload) {
  const offerPlans = getOfferPlans();
  const products = Array.isArray(payload?.event?.products) ? payload.event.products : [];
  const offerIds = products.flatMap((product) =>
    (Array.isArray(product?.offers) ? product.offers : []).map((offer) => offer?.id),
  );
  const known = offerIds.find((offerId) => offerPlans[offerId]);
  if (known) return { offerId: known, plan: offerPlans[known] };

  // Variação de formato: procura os códigos conhecidos no corpo todo.
  const body = JSON.stringify(payload ?? null);
  const entry = Object.entries(offerPlans).find(([offerId]) => body.includes(offerId));
  return entry ? { offerId: entry[0], plan: entry[1] } : { offerId: offerIds[0] || null, plan: null };
}

/**
 * Aviso de teste, disparado por "Testar configuração" no painel da Hubla: os
 * identificadores terminam em "-tester". Não é venda, então não mexe em acesso.
 */
function isSandbox(payload) {
  const event = payload?.event || {};
  const ids = [
    event.id,
    event.subscription?.id,
    event.invoice?.id,
    event.smartInstallment?.id,
    ...(Array.isArray(event.subscriptions) ? event.subscriptions.map((item) => item?.id) : []),
  ];
  return ids.some((id) => typeof id === "string" && id.endsWith("-tester"));
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Próxima renovação, calculada a partir do aviso: a Hubla não manda essa data
 * pronta. Pagamento confirmado é a referência firme (data da venda mais o
 * ciclo da assinatura). Aviso de ativação só serve de ponto de partida
 * (provisional), porque a data de ativação não muda nas renovações.
 * Devolve { renewsAt, provisional } ou null.
 */
function readRenewal(payload, eventType) {
  const event = payload?.event || {};
  const subscription = event.subscription || {};
  const months = Number(subscription.billingCycleMonths || event.billingCycleMonths) || 1;
  const valid = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };

  if (/^invoice\.payment_succeeded$/i.test(eventType)) {
    const paidAt = valid(event.invoice?.saleDate) || valid(event.invoice?.createdAt) || new Date();
    return { renewsAt: addMonths(paidAt, months), provisional: false };
  }

  const activatedAt = valid(subscription.activatedAt) || valid(event.activatedAt);
  if (!activatedAt) return null;
  const renewsAt = addMonths(activatedAt, months);
  // Ativação antiga daria uma data já passada: melhor ficar sem data.
  return renewsAt > new Date() ? { renewsAt, provisional: true } : null;
}

async function recordEvent({ eventType, email, offerId, plan, outcome, detail, payload }) {
  await postgres.query(
    `
      INSERT INTO hubla_events (id, event_type, email, offer_id, plan, outcome, detail, raw)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [createId("hubla"), eventType, email, offerId, plan, outcome, detail, JSON.stringify(payload ?? null)],
  );
}

/**
 * Processa um aviso. Sempre grava o que chegou; o resultado diz o que foi
 * feito: granted, suspended, ignored (aviso que não mexe em acesso), test
 * (aviso de teste do painel) ou needs_review (algo que a equipe precisa olhar).
 */
async function handleWebhook(payload) {
  await ensureSchema();
  const eventType = String(payload?.type || "desconhecido").slice(0, 150);
  const { email, name, phone, document } = readBuyer(payload);
  const { offerId, plan } = readOffer(payload);
  const base = { eventType, email, offerId, plan, payload };

  const grants = GRANT_PATTERN.test(eventType);
  const revokes = REVOKE_PATTERN.test(eventType);

  if (isSandbox(payload)) {
    const efeito = grants ? "liberaria o acesso" : revokes ? "tiraria o acesso" : "seria apenas registrado";
    await recordEvent({ ...base, outcome: "test", detail: `Teste do painel da Hubla: numa venda real, ${efeito}.` });
    return { outcome: "test" };
  }

  if (!grants && !revokes) {
    await recordEvent({ ...base, outcome: "ignored", detail: "Aviso apenas registrado." });
    return { outcome: "ignored" };
  }

  if (!email) {
    await recordEvent({ ...base, outcome: "needs_review", detail: "Não encontrei o e-mail do cliente no aviso." });
    return { outcome: "needs_review" };
  }

  if (revokes) {
    const result = await applyEntitlement({ email, plan, active: false });
    // Bloqueia (ou ajusta) os acessos nas plataformas externas.
    if (result?.member) {
      syncMemberSafely(result.member.id);
      // Ingressos de eventos presenciais deixam de valer junto com a assinatura.
      syncMemberTicketsSafely(result.member.id);
    }
    const detail = !result
      ? "Não há cadastro com este e-mail."
      : result.suspended
        ? "Acesso suspenso."
        : `Assinatura encerrada; o cliente segue com acesso pelo plano ${result.member.plan}.`;
    const outcome = result?.suspended ? "suspended" : "ignored";
    await recordEvent({ ...base, outcome, detail });
    return { outcome };
  }

  // Oferta fora das duas conhecidas: libera como Essencial e avisa a equipe,
  // para ninguém pagar e ficar sem acesso.
  const renewal = readRenewal(payload, eventType);
  const { member, created } = await applyEntitlement({
    email,
    name,
    plan: plan || "essencial",
    active: true,
    renewsAt: renewal?.renewsAt || null,
    renewsAtProvisional: Boolean(renewal?.provisional),
  });
  // Telefone da compra: só preenche quando o cadastro ainda não tem (a equipe pode ter corrigido).
  if (phone && !member.phone) {
    await postgres.query("UPDATE members SET phone = $2 WHERE id = $1 AND phone IS NULL", [member.id, phone]);
  }
  // Documento da compra: só preenche quando o cadastro ainda não tem.
  if (document && !member.document) {
    await postgres.query("UPDATE members SET document = $2 WHERE id = $1 AND document IS NULL", [member.id, document]);
  }
  // Cria ou renova os acessos nas plataformas externas, sem segurar a resposta à Hubla.
  syncMemberSafely(member.id);
  // Ingressos dos eventos presenciais que o plano inclui.
  syncMemberTicketsSafely(member.id);
  let detail = created ? "Cadastro criado." : "Cadastro já existia: acesso confirmado.";

  // Só quem ainda não tem senha recebe o e-mail, e só uma vez.
  if (!member.password_hash && !member.welcome_sent_at) {
    const sent = await sendWelcomeOnce(member);
    if (sent !== null) {
      detail += sent ? " E-mail de boas-vindas enviado." : " FALHA ao enviar o e-mail de boas-vindas.";
    }
    // O guia dos primeiros passos (360 e outras plataformas) acompanha o e-mail
    // de acesso da compra. Quem já era cliente não recebe na renovação: para
    // esses a equipe manda pelo /adm.
    if (sent) {
      const guide = await sendGuideOnceSafely(member);
      if (guide !== null) {
        detail += guide ? " Guia de boas-vindas enviado." : " FALHA ao enviar o guia de boas-vindas.";
      }
    }
  }

  if (!plan) {
    await recordEvent({
      ...base,
      plan: "essencial",
      outcome: "needs_review",
      detail: `${detail} Oferta não reconhecida: liberado como Essencial, confira o plano.`,
    });
    return { outcome: "needs_review" };
  }

  await recordEvent({ ...base, outcome: "granted", detail });
  return { outcome: "granted" };
}

module.exports = {
  isWebhookConfigured,
  isValidToken,
  handleWebhook,
  readBuyer,
  readOffer,
  readRenewal,
  isSandbox,
};
