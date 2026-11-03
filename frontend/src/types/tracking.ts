import type { PlanId } from "./catalog";

// ---------------------------------------------------------------------------
// Anamnese
// ---------------------------------------------------------------------------

export interface DiagnosticQuestion {
  id: string;
  /** Número da pergunta na ordem da Matriz, para exibição. */
  number: number;
  section: string;
  label: string;
  type: "text" | "phone" | "textarea" | "select" | "multi" | "moeda" | "percentual";
  options?: string[];
  /** Opção que não combina com as outras (ex.: "Nenhum"). */
  exclusiveOption?: string;
  /** Indicadores: opção de desconhecimento/ausência de meta (ex.: "Não sei informar"). */
  emptyOption?: string;
  optional?: boolean;
}

/** Leitura de maturidade calculada pela Matriz a partir das respostas. */
export interface MaturityReading {
  version: string;
  pillars: Array<{
    id: string;
    score: number | null;
    stage: StageId | "";
    /** Leitura com base em uma única pergunta: não tratar como nota precisa. */
    provisional?: boolean;
    notes: string[];
  }>;
  signals: string[];
  /** Pergunta 28: calibra quantas ações ativas cabem no plano. */
  execution: { answer: string | null; maxActions: number | null };
}

/** Texto, ou lista de opções nas perguntas de múltipla escolha. */
export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

export interface Diagnostic {
  id: string;
  /** draft = respondendo; submitted = enviada. */
  status: "draft" | "submitted";
  answers: Answers;
  submittedAt: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Diagnóstico 360° + Plano de Ação
// ---------------------------------------------------------------------------

export type StageId = "reativo" | "em_organizacao" | "estruturado" | "gerencial";

export interface PlanPillar {
  id: string;
  stage: StageId | "";
  /** Representação visual do estágio, de 0 a 10. Opcional. */
  score: number | string | null;
  exists: string;
  attention: string;
  requires: string;
}

export interface PlanPriority {
  name: string;
  why: string;
  blocks: string;
  changes: string;
}

export interface PlanAction {
  id: string;
  title: string;
  why: string;
  steps: string[];
  indicators: string[];
  doneCriteria: string;
  content: string;
  resource: string;
  crm: string;
}

export interface PlanContent {
  identification: { company: string; owner: string; segment: string; city: string };
  diagnosis: { reading: string; pillars: PlanPillar[]; synthesis: string };
  direction: {
    main: PlanPriority;
    complementary: PlanPriority | null;
    route: { now: string; next: string; later: string };
  };
  /** Vem vazio para o plano Essencial: o Plano de Ação é do Premium. */
  actions: PlanAction[];
  development: { ceo: string[]; team: string[] };
  nextStep: { action: string; why: string; steps: string[]; doneCriteria: string; after: string };
}

export interface PlanDoc {
  id: string;
  cycle: number;
  status: "pending" | "approved";
  /** ia = rascunho gerado pelo agente; manual = escrito pela equipe. */
  source: "ia" | "manual";
  content: PlanContent;
  requestedAt: string;
  reviewDueAt: string;
  approvedAt: string | null;
  updatedAt: string;
  /** Rascunho da IA: none (sem IA), queued, generating, ready ou failed. */
  draftStatus: DraftStatus;
  draftError: string | null;
}

export type DraftStatus = "none" | "queued" | "generating" | "ready" | "failed";

/** O que o empresário registra em cada ação. */
export interface ActionProgress {
  responsible: string;
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
}

export interface PlanReview {
  cycle: number;
  requestedAt: string;
  /** Prazo da equipe: 72 horas úteis depois do pedido. */
  dueAt: string;
}

export interface NamedItem {
  id: string;
  name: string;
}

export interface StageItem extends NamedItem {
  id: StageId;
  range: string;
}

export interface MemberPlanResponse {
  /** Último ciclo aprovado. null enquanto nenhum foi liberado. */
  plan: PlanDoc | null;
  progress: Record<string, ActionProgress>;
  /** Ciclo que está com a equipe para revisão, se houver. */
  review: PlanReview | null;
  canRequestNext: boolean;
  /** O último plano aprovado foi liberado e o aluno ainda não o abriu. */
  planUnseen: boolean;
  pillars: NamedItem[];
  stages: StageItem[];
}

// ---------------------------------------------------------------------------
// Atividades, check-in, suporte, calendário
// ---------------------------------------------------------------------------

export type ActivityAudience = "essencial" | "premium" | "all";

export interface Activity {
  id: string;
  audience: ActivityAudience;
  audienceLabel: string;
  title: string;
  description: string | null;
  /** Data pura, "AAAA-MM-DD". */
  dueDate: string | null;
  publishedAt: string;
  done: boolean;
  completedAt: string | null;
}

/** Mensagens do suporte que a IA marcou como uso indevido. */
export interface AdminSupportFlags {
  days: number;
  categories: Array<{ id: string; label: string; severe: boolean }>;
  occurrences: Array<{
    id: string;
    memberId: string;
    name: string;
    email: string;
    plan: PlanId;
    category: string;
    content: string;
    reply: string | null;
    createdAt: string;
  }>;
  members: Array<{
    memberId: string;
    name: string;
    email: string;
    plan: PlanId;
    total: number;
    severe: number;
    lastAt: string;
  }>;
  agentConfigured: boolean;
}

export interface InsightSuggestion {
  id: string;
  title: string;
  content: string;
  reason: string;
  status: "pending" | "approved" | "dismissed";
  articleId: string | null;
}

/** Relatório semanal das conversas do suporte. */
export interface SupportInsight {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "generating" | "ready" | "failed";
  error: string | null;
  stats: { conversations: number; conversationsRead: number; userMessages: number; flagged: number } | null;
  report: {
    overview: string;
    topQuestions: Array<{ question: string; count: number; handled: "respondida" | "encaminhada" | "sem_resposta" }>;
    gaps: Array<{ question: string; count: number; note: string }>;
    suggestions: InsightSuggestion[];
  } | null;
  createdAt: string;
}

export interface AdminInsights {
  insights: SupportInsight[];
  audiences: Array<{ id: KnowledgeAudience; label: string }>;
  weekDays: number;
  agentConfigured: boolean;
}

export type KnowledgeAudience = "all" | "premium";
/** content = informação para responder; rules = regra de conduta que a IA segue. */
export type KnowledgeKind = "content" | "rules";

/** Artigo da base de conhecimento do assistente de suporte. */
export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  kind: KnowledgeKind;
  audience: KnowledgeAudience;
  active: boolean;
  chars: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminKnowledge {
  articles: KnowledgeArticle[];
  audiences: Array<{ id: KnowledgeAudience; label: string }>;
  kinds: Array<{ id: KnowledgeKind; label: string }>;
  /** Soma dos artigos ativos, em caracteres. */
  activeChars: number;
  limits: { article: number; total: number };
  agentConfigured: boolean;
}

export interface AdminActivity extends Activity {
  /** Quantos alunos marcaram como feita, de quantos receberam. */
  doneCount: number;
  audienceCount: number;
}

export interface Checkin {
  id: string;
  /** "AAAA-MM". */
  period: string;
  progress: string;
  progressLabel: string;
  reason: string | null;
  reasonLabel: string | null;
  evolution: string | null;
  feedback: string | null;
  createdAt: string;
}

export interface CheckinOption {
  id: string;
  label: string;
}

export interface CheckinResponse {
  period: string;
  current: Checkin | null;
  history: Checkin[];
  progressOptions: CheckinOption[];
  reasonOptions: CheckinOption[];
}

export interface SupportMessage {
  id: string;
  /** user = aluno; assistant = assistente virtual; team = equipe Gestão 360; system = aviso da plataforma. */
  role: "user" | "assistant" | "team" | "system";
  content: string;
  /** A resposta orienta a falar com o time humano: o chat mostra as opções de contato. */
  handoff: boolean;
  createdAt: string;
}

/** Conversa do suporte com o contato do time humano. */
export interface SupportConversation {
  messages: SupportMessage[];
  /** Atendimento humano em aberto; enquanto existir, a IA não responde. */
  ticket: { id: string; status: "waiting" | "active"; adminName: string | null } | null;
  /** Link do WhatsApp do time; null enquanto o número não foi cadastrado. */
  whatsappUrl: string | null;
  /** Horário do time em texto, ex.: "de segunda a sexta, das 9h às 18h". */
  supportHours: string;
  /** O time está atendendo agora? Fora do horário a opção do chat não aparece. */
  chatSupportOpen: boolean;
}

/** Atendimento humano pelo chat, na visão da equipe. */
export interface AdminTicket {
  id: string;
  status: "waiting" | "active" | "closed";
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberPlan: PlanId;
  adminId: string | null;
  adminName: string | null;
  openedAt: string;
  claimedAt: string | null;
  closedAt: string | null;
}

export interface AdminTickets {
  waiting: AdminTicket[];
  /** Em andamento com quem está logado. */
  mine: AdminTicket[];
  /** Quantos estão em andamento com outras pessoas (não aparecem na lista). */
  othersActive: number;
  closed: AdminTicket[];
}

export interface AdminTicketDetail {
  ticket: AdminTicket;
  /** Últimas mensagens de antes do atendimento (conversa com a IA). */
  context: SupportMessage[];
  messages: SupportMessage[];
}

/** Ferramenta ou modelo para baixar. */
export interface Tool {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  categoryLabel: string;
  plan: PlanId;
  active: boolean;
  createdAt: string;
}

/** Ingresso do cliente para um evento presencial. */
export interface EventTicket {
  code: string;
  /** Texto que vai dentro do QR code. */
  qrContent: string;
  /** A entrada é conferida pelo sistema de credenciamento da Gestão 360. */
  credenciamento: boolean;
  issuedAt: string;
  holderName: string;
  event: { id: string; title: string; startsAt: string; endsAt: string | null; location: string | null };
}

/** O que a equipe vê ao ler um ingresso na entrada. */
export interface AdminEventTicket {
  code: string;
  /** A assinatura do cliente está ativa neste momento e cobre o evento. */
  valid: boolean;
  reason: string | null;
  holder: { id: string; name: string; email: string; plan: PlanId };
  event: { id: string; title: string; startsAt: string; endsAt: string | null; location: string | null };
  checkins: Array<{ checkedAt: string; adminName: string | null }>;
}

export interface AdminSettings {
  supportWhatsapp: string;
  /** "HH:MM", no horário de Brasília. */
  supportStart: string;
  supportEnd: string;
  /** Dias com atendimento, separados por vírgula: 0 = domingo ... 6 = sábado. */
  supportDays: string;
  /** Minutos sem resposta até o atendimento voltar para a fila. */
  supportIdleMinutes: string;
  supportAlertEmail: string;
  /** Horário em texto, montado pelo servidor. */
  supportHours: string;
  /** Dias com horários para a integração do CRM, no mesmo formato de supportDays. */
  onboardingDays: string;
  /** Primeiro período do dia: "HH:MM", no horário de Brasília. */
  onboardingStart: string;
  onboardingEnd: string;
  /** Segundo período, opcional: os dois vazios = não há. */
  onboardingStart2: string;
  onboardingEnd2: string;
  /** Duração de cada chamada, em minutos (15 a 240). */
  onboardingSlotMinutes: string;
  /** Intervalo entre uma chamada e a seguinte, em minutos (0 a 120). */
  onboardingGapMinutes: string;
  /** Integração do CRM para NOVOS clientes: "1" liga, "0" desliga. */
  crmEnabled: string;
}

/** Pessoa da equipe da Gestão 360, como o master vê em Equipe. */
export interface AdminTeamMember {
  id: string;
  name: string;
  email: string;
  role: "master" | "admin";
  /** Chaves das áreas liberadas (o master vê tudo). */
  permissions: string[];
  /** Já criou a senha pelo link de primeiro acesso. */
  hasPassword: boolean;
  accessSentAt: string | null;
  createdAt: string;
  isYou: boolean;
}

/** Área do /adm que pode ser liberada; nome e descrição vêm do servidor. */
export interface AdminTeamArea {
  key: string;
  label: string;
  description: string;
}

export type OnboardingStatus ="scheduled" | "done" | "canceled";

/** Chamada de integração do CRM marcada pelo aluno. */
export interface OnboardingBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  whatsapp: string;
  status: OnboardingStatus;
  /** Link do Google Meet; a equipe informa depois do agendamento. */
  meetLink: string | null;
  createdAt: string;
  /** Registro opcional que o aluno deixou depois da chamada. */
  memberNotes: string | null;
  /** Motivo informado pela equipe ao remarcar; null quando não foi remarcada. */
  rescheduleReason: string | null;
}

/** Chamada que já aconteceu e espera o registro opcional do aluno. */
export interface OnboardingPendingReview {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface OnboardingSlot {
  startsAt: string;
  /** "HH:mm", no horário de Brasília. */
  time: string;
  available: boolean;
}

export interface OnboardingDay {
  /** "AAAA-MM-DD". */
  date: string;
  slots: OnboardingSlot[];
}

export interface OnboardingResponse {
  /**
   * Integração do CRM ligada para este aluno. false = indisponível (os demais
   * campos não vêm); ausente = ligada, como nas respostas anteriores.
   */
  enabled?: boolean;
  /** Agendamento em aberto, se houver. */
  booking: OnboardingBooking | null;
  /** Última integração já realizada. */
  lastDone: OnboardingBooking | null;
  whatsapp: string;
  slotMinutes: number;
  days: OnboardingDay[];
  /**
   * Chamada já realizada aguardando o registro opcional do aluno. Só aparece a
   * partir de 30 min depois do fim da chamada e enquanto o aluno não registrar.
   */
  pendingReview: OnboardingPendingReview | null;
}

/** Uma chamada de integração, como a equipe vê no /adm. */
export interface AdminOnboardingCall extends OnboardingBooking {
  /** Conversa no WhatsApp do aluno; null quando o número não serve. */
  whatsappUrl: string | null;
  member: { id: string; name: string; email: string; plan: PlanId };
  /** Registro da equipe sobre a chamada; obrigatório para concluir. */
  adminNotes: string | null;
  /** Registro opcional do aluno e quando ele foi enviado. */
  memberNotes: string | null;
  memberNotesAt: string | null;
}

/** Consumo da API da IA por mês e por tipo de uso. */
export interface AdminAiUsage {
  months: Array<{
    /** "AAAA-MM". */
    month: string;
    costUsd: number;
    items: Array<{
      kind: string;
      label: string;
      calls: number;
      tokens: number;
      costUsd: number;
      costPerCallUsd: number;
      models: string[];
      unknownPrice: boolean;
    }>;
  }>;
  students: number;
  agentConfigured: boolean;
}

export type EventType = "treinamento" | "encontro" | "summit";

export interface CalendarEvent {
  id: string;
  type: EventType;
  typeLabel: string;
  plan: PlanId;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  /** O plano de quem lê não cobre o evento: vem sem os links. */
  locked: boolean;
  /** Evento presencial com ingresso próprio (QR code). */
  ticketed: boolean;
  /** Janela de assinatura que dá direito ao ingresso (YYYY-MM-DD), ou null. */
  ticketWindowStart: string | null;
  ticketWindowEnd: string | null;
  /** Bônus: dá direito ao ingresso aos N primeiros assinantes, ou null. */
  ticketBonusLimit: number | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
}

// ---------------------------------------------------------------------------
// Painel /adm
// ---------------------------------------------------------------------------

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  planName: string;
  accessStatus: "active" | "suspended";
  /** Integração do CRM ligada para este aluno (agendar + acesso CRM). */
  crmEnabled: boolean;
  /** Data da compra informada no cadastro manual ("AAAA-MM-DD"); base do lembrete de renovação. */
  purchaseDate: string | null;
  /** WhatsApp, só dígitos com o código do país (ex.: "5511999991234"). */
  phone?: string | null;
  /** CPF (11 dígitos) ou CNPJ (14 dígitos), só números. */
  document?: string | null;
  /** false = ainda não criou a senha (não fez o primeiro acesso). */
  hasPassword: boolean;
  welcomeSentAt: string | null;
  createdAt: string;
  anamneseStatus: "draft" | "submitted" | null;
  anamneseSubmittedAt: string | null;
  pendingPlan: { id: string; cycle: number; requestedAt: string; dueAt: string } | null;
  approvedPlan: { id: string; cycle: number; actionsTotal: number; actionsDone: number } | null;
  lastCheckin: { period: string; progress: string; progressLabel: string } | null;
  /**
   * Entrega dos e-mails (só na lista de alunos). null = nada registrado: aluno
   * anterior ao registro ou criado com senha definida pela equipe.
   */
  delivery?: AdminMemberDelivery | null;
}

export type EmailDeliveryStatus = "sent" | "failed" | "sending";

/** Resumo da entrega para a lista de alunos. */
export interface AdminMemberDelivery {
  /** Último e-mail "Acesso liberado: criar a senha"; null = nunca registrado. */
  accessStatus: EmailDeliveryStatus | null;
  accessSentAt: string | null;
  accessOpenedAt: string | null;
  firstLoginAt: string | null;
  sent: number;
  failed: number;
}

/** Um e-mail enviado ao aluno, como ficou registrado. */
export interface AdminEmailLogEntry {
  id: string;
  /** "access" = acesso liberado (criar a senha). */
  kind: string;
  label: string;
  subject: string;
  recipient: string;
  /** Enviado pela equipe no painel (e não sozinho pela plataforma). */
  manual: boolean;
  status: EmailDeliveryStatus;
  error: string | null;
  sentAt: string;
  openedAt: string | null;
  openCount: number;
}

export interface AdminMemberDeliveryDetail {
  emails: AdminEmailLogEntry[];
  signals: {
    accessLinkOpenedAt: string | null;
    hasPassword: boolean;
    firstLoginAt: string | null;
    lastLoginAt: string | null;
  };
}

export interface AdminMemberAccess {
  productId: string;
  productName: string;
  plan: PlanId;
  /** Link geral do entregável, usado quando o aluno não tem um individual. */
  defaultUrl: string | null;
  accessUrl: string | null;
  note: string | null;
}

/** Acesso do aluno em uma plataforma externa (Academy, Formação Executiva, CRM). */
export interface ExternalAccount {
  platform: string;
  label: string;
  /** A integração com esta plataforma está ligada neste ambiente. */
  configured: boolean;
  desired: "active" | "blocked" | null;
  /** pending = na fila; ok = a plataforma confirmou; failed = parou de tentar. */
  status: "pending" | "ok" | "failed" | null;
  /** Resposta da plataforma: criado, reativado, ja_existia, ja_cliente, bloqueado... */
  remoteStatus: string | null;
  validUntil: string | null;
  attempts: number;
  lastError: string | null;
  syncedAt: string | null;
}

export interface AdminMemberDetail {
  member: AdminMember;
  externalAccounts: ExternalAccount[];
  questions: DiagnosticQuestion[];
  diagnostic: Diagnostic | null;
  plans: Array<{
    id: string;
    cycle: number;
    status: "pending" | "approved";
    requestedAt: string;
    approvedAt: string | null;
  }>;
  checkins: Checkin[];
  messages: SupportMessage[];
  accesses: AdminMemberAccess[];
}

export interface AdminOverview {
  totals: {
    students: number;
    essencial: number;
    premium: number;
    plansPending: number;
    anamneseMissing: number;
    checkinsThisMonth: number;
  };
  pendingPlans: AdminMember[];
  supportWaiting: Array<{ memberId: string; name: string; content: string; createdAt: string }>;
  /** Uso indevido do suporte nos últimos 7 dias. */
  supportFlagged: { members: number; messages: number };
  /** Alunos esperando alguém assumir o atendimento pelo chat. */
  supportQueue: number;
  /** Acessos em plataformas externas que falharam e pararam de tentar. */
  externalFailed: number;
  upcomingEvents: CalendarEvent[];
  /** A IA que gera o rascunho do plano já está ligada? */
  agentConfigured: boolean;
}

export interface AdminPlanMember {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  planName: string;
}

export interface AdminPlanListItem {
  id: string;
  cycle: number;
  status: "pending" | "approved";
  source: "ia" | "manual";
  draftStatus: DraftStatus;
  requestedAt: string;
  dueAt: string;
  approvedAt: string | null;
  member: AdminPlanMember;
}

export interface AdminPlanDetail {
  plan: PlanDoc;
  member: AdminPlanMember;
  questions: DiagnosticQuestion[];
  answers: Answers;
  maturity: MaturityReading;
  /** O que a IA escreveu para quem revisa. Não aparece para o cliente. */
  agentNotes: {
    declaredPriorityRelation: string;
    reviewerNotes: string;
    /** Regras que o rascunho ainda descumpre depois da correção automática. */
    remainingErrors: string[];
  } | null;
  agentConfigured: boolean;
  /** Ciclo anterior e o que o aluno fez nele (a partir do segundo ciclo). */
  previous: { plan: PlanDoc; progress: Record<string, ActionProgress> } | null;
  checkins: Checkin[];
  /** O que ainda impede a aprovação. */
  errors: string[];
  catalog: { ceo: string[]; academy: string[] };
  pillars: NamedItem[];
  stages: StageItem[];
  maxActions: number;
}

export interface AdminProduct {
  id: string;
  name: string;
  description: string | null;
  plan: PlanId;
  accessUrl: string | null;
  /** Abre uma tela da própria plataforma: não usa link. */
  internal: boolean;
}

export interface HublaEvent {
  id: string;
  eventType: string;
  email: string | null;
  plan: PlanId | null;
  /** test = aviso de teste do painel da Hubla (não mexe em acesso). */
  outcome: "granted" | "suspended" | "ignored" | "test" | "needs_review";
  detail: string | null;
  raw: unknown;
  receivedAt: string;
}
