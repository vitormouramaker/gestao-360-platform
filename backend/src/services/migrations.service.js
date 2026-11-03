const { postgres } = require("../server/connect");

// Entregáveis de cada plano. Esta lista é a fonte da verdade de nomes, textos e
// ordem: a cada subida o banco é atualizado a partir dela e o que saiu da lista
// é desativado. O link de acesso é a exceção — depois de definido no painel de
// administração, vale o do banco.
// Os do Premium são só o que o plano acrescenta — ele inclui tudo do Essencial.
const PRODUCTS = [
  {
    id: "prod_diagnostico",
    slug: "diagnostico-empresarial",
    name: "Diagnóstico Empresarial",
    description: "Análise dos gargalos e oportunidades do negócio.",
    plan: "essencial",
    accessUrl: null,
    icon: "chart",
    art: "orbit",
  },
  {
    id: "prod_crm",
    slug: "crm",
    name: "CRM Business",
    description: "CRM, vendas, clientes, estoque e financeiro em uma única plataforma.",
    plan: "essencial",
    accessUrl: "https://crm.example.com",
    icon: "monitor",
    art: "layers",
  },
  {
    id: "prod_formacao_executiva",
    slug: "formacao-executiva",
    name: "Formação Executiva",
    description: "Conteúdos gravados de gestão, liderança e visão estratégica.",
    plan: "essencial",
    accessUrl: "https://formacao.example.com",
    icon: "graduation",
    art: "compass",
  },
  {
    id: "prod_academy",
    slug: "academy",
    name: "Academy",
    description:
      "Treinamentos gravados para o time em Vendas, Marketing, Gestão, Tecnologia e Desenvolvimento Pessoal.",
    plan: "essencial",
    accessUrl: "https://academy.example.com",
    icon: "book",
    art: "path",
  },
  {
    id: "prod_grupo_whatsapp",
    slug: "grupo-whatsapp",
    name: "Grupo Exclusivo no WhatsApp",
    description: "Dúvidas pontuais, orientações e troca na comunidade.",
    plan: "essencial",
    accessUrl: null,
    icon: "chat",
    art: "orbit",
  },
  {
    id: "prod_treinamentos",
    slug: "treinamentos-ao-vivo",
    name: "Treinamentos ao Vivo para o Time",
    description: "3 capacitações online em Vendas, Cultura e Atendimento.",
    plan: "essencial",
    accessUrl: null,
    icon: "users",
    art: "layers",
  },
  {
    id: "prod_encontros",
    slug: "encontros-mensais",
    name: "Encontros Mensais ao Vivo",
    description: "Encontros online com mentores e especialistas convidados.",
    plan: "essencial",
    accessUrl: null,
    icon: "video",
    art: "path",
  },
  {
    id: "prod_summits",
    slug: "summits-presenciais",
    name: "Summits Presenciais",
    description: "2 encontros presenciais com empresários e especialistas.",
    plan: "essencial",
    accessUrl: null,
    icon: "calendar",
    art: "compass",
  },
  {
    id: "prod_plano_de_acao",
    slug: "plano-de-acao",
    name: "Plano de Ação",
    description: "Direcionamentos práticos com base no diagnóstico realizado.",
    plan: "premium",
    accessUrl: null,
    icon: "file",
    art: "path",
  },
  {
    id: "prod_atividades",
    slug: "atividades-praticas",
    name: "Atividades Práticas",
    description: "Aplicações semanais para tirar o plano de ação do papel.",
    plan: "premium",
    accessUrl: null,
    icon: "settings",
    art: "layers",
  },
  {
    id: "prod_treinamentos_premium",
    slug: "treinamentos-ao-vivo-premium",
    name: "Mais 3 Treinamentos ao Vivo",
    description: "Finanças, Liderança e Marketing: 6 capacitações online para o time no total.",
    plan: "premium",
    accessUrl: null,
    icon: "users",
    art: "orbit",
  },
  {
    id: "prod_summits_premium",
    slug: "summits-presenciais-premium",
    name: "Mais 2 Summits Presenciais",
    description: "4 encontros presenciais trimestrais com empresários e especialistas no total.",
    plan: "premium",
    accessUrl: null,
    icon: "calendar",
    art: "compass",
  },
  {
    id: "prod_imersao",
    slug: "imersao-presencial",
    name: "Bônus: Imersão Presencial",
    description: "Programa presencial de desenvolvimento pessoal em 3 dias.",
    plan: "premium",
    accessUrl: null,
    icon: "gem",
    art: "layers",
  },
  {
    id: "prod_evento_anual",
    slug: "evento-anual",
    name: "Bônus: Evento Anual",
    description: "1 passaporte para o evento anual de Vendas, Marketing, Gestão e Inovação.",
    plan: "premium",
    accessUrl: null,
    icon: "ticket",
    art: "orbit",
  },
];

// Entregáveis que abrem uma tela da própria plataforma (os demais abrem um link).
const INTERNAL_PAGES = {
  prod_diagnostico: "diagnostic",
  prod_treinamentos: "calendar",
  prod_encontros: "calendar",
  prod_summits: "calendar",
  prod_plano_de_acao: "action-plan",
  prod_atividades: "activities",
  prod_treinamentos_premium: "calendar",
  prod_summits_premium: "calendar",
};

let schemaReady = null;

async function createSchema() {
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS members (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      avatar_color VARCHAR(50),
      avatar_url TEXT,
      plan VARCHAR(30) NOT NULL DEFAULT 'essencial',
      plan_status VARCHAR(30) NOT NULL DEFAULT 'active',
      is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
      tokens_valid_from TIMESTAMPTZ,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      user_agent VARCHAR(255),
      ip VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      rotated BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS auth_sessions_member_idx ON auth_sessions (member_id)",
  );
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at)",
  );

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(100) PRIMARY KEY,
      slug VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      plan VARCHAR(30) NOT NULL DEFAULT 'essencial',
      access_url TEXT,
      art VARCHAR(50),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS icon VARCHAR(50)");
  await postgres.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS internal_page VARCHAR(50)");

  // Link ou ingresso individual de um aluno para um entregável (ex.: Evento Anual).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS member_product_access (
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      access_url TEXT,
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, product_id)
    )
  `);

  // Diagnóstico Empresarial: o aluno responde, a equipe analisa e só então libera.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS diagnostics (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
      answers JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(30) NOT NULL DEFAULT 'submitted',
      analysis TEXT,
      submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMPTZ,
      released_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL
    )
  `);

  // Itens do Plano de Ação (kind = action_plan) e Atividades Práticas (kind = activity).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS member_tasks (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      kind VARCHAR(30) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due_date DATE,
      completed_at TIMESTAMPTZ,
      created_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS member_tasks_member_idx ON member_tasks (member_id, kind)",
  );

  // Calendário: treinamentos ao vivo, encontros mensais e summits presenciais.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(100) PRIMARY KEY,
      type VARCHAR(30) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      location TEXT,
      meeting_url TEXT,
      recording_url TEXT,
      plan VARCHAR(30) NOT NULL DEFAULT 'essencial',
      created_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query("CREATE INDEX IF NOT EXISTS events_starts_idx ON events (starts_at)");

  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ");
  // Equipe: master vê e faz tudo; os demais administradores, só as áreas
  // marcadas (ver admin-permissions.service). Quem já era administrador antes
  // das permissões existirem vira master.
  const adminRole = await postgres.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'admin_role'",
  );
  if (adminRole.rowCount === 0) {
    await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_role VARCHAR(20)");
    await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_permissions TEXT");
    await postgres.query("UPDATE members SET admin_role = 'master' WHERE is_platform_admin = TRUE");
  }

  // Link curto de primeiro acesso (ver access-links.service).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS access_links (
      code VARCHAR(16) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      password_mark VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  // Telefone (WhatsApp) do cliente, só dígitos com o código do país (utils/phone).
  // Na primeira vez, preenche com o que já existe: aviso da Hubla, anamnese e
  // agendamento da integração do CRM, nessa ordem.
  const phoneColumn = await postgres.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'phone'",
  );
  if (phoneColumn.rowCount === 0) {
    await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS phone VARCHAR(20)");
    const { normalizePhone } = require("../utils/phone");
    const found = await postgres.query(`
      SELECT m.id,
        (SELECT COALESCE(h.raw #>> '{event,user,phone}', h.raw #>> '{event,subscription,payer,phone}', h.raw #>> '{event,invoice,payer,phone}')
           FROM hubla_events h
           WHERE h.email = m.email
             AND COALESCE(h.raw #>> '{event,user,phone}', h.raw #>> '{event,subscription,payer,phone}', h.raw #>> '{event,invoice,payer,phone}') IS NOT NULL
           ORDER BY h.received_at DESC LIMIT 1) AS hubla,
        (SELECT d.answers ->> 'q03' FROM diagnostics d WHERE d.member_id = m.id) AS anamnese,
        (SELECT c.whatsapp FROM onboarding_calls c WHERE c.member_id = m.id ORDER BY c.created_at DESC LIMIT 1) AS integracao
      FROM members m
      WHERE m.is_platform_admin = FALSE
    `).catch(() => ({ rows: [] }));
    for (const row of found.rows) {
      const phone = normalizePhone(row.hubla) || normalizePhone(row.anamnese) || normalizePhone(row.integracao);
      if (phone) await postgres.query("UPDATE members SET phone = $2 WHERE id = $1 AND phone IS NULL", [row.id, phone]);
    }
  }

  // CPF ou CNPJ do cliente, só dígitos (utils/document). Na primeira vez,
  // preenche com o documento que veio nos avisos da Hubla.
  const documentColumn = await postgres.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'document'",
  );
  if (documentColumn.rowCount === 0) {
    await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS document VARCHAR(14)");
    const { normalizeDocument } = require("../utils/document");
    const found = await postgres.query(`
      SELECT m.id,
        (SELECT COALESCE(h.raw #>> '{event,user,document}', h.raw #>> '{event,subscription,payer,document}', h.raw #>> '{event,invoice,payer,document}')
           FROM hubla_events h
           WHERE h.email = m.email
             AND COALESCE(h.raw #>> '{event,user,document}', h.raw #>> '{event,subscription,payer,document}', h.raw #>> '{event,invoice,payer,document}') IS NOT NULL
           ORDER BY h.received_at DESC LIMIT 1) AS hubla
      FROM members m
      WHERE m.is_platform_admin = FALSE
    `).catch(() => ({ rows: [] }));
    for (const row of found.rows) {
      const document = normalizeDocument(row.hubla);
      if (document) await postgres.query("UPDATE members SET document = $2 WHERE id = $1 AND document IS NULL", [row.id, document]);
    }
  }

  // Registro dos e-mails enviados (ver email-log.service) e sinais de acesso.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id VARCHAR(40) PRIMARY KEY,
      member_id VARCHAR(100) REFERENCES members(id) ON DELETE CASCADE,
      kind VARCHAR(40) NOT NULL,
      subject VARCHAR(255),
      recipient VARCHAR(255),
      manual BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'sending',
      error TEXT,
      message_id VARCHAR(255),
      opened_at TIMESTAMPTZ,
      open_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query("CREATE INDEX IF NOT EXISTS email_log_member_idx ON email_log (member_id, created_at DESC)");
  await postgres.query("ALTER TABLE access_links ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ");
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ");
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ");

  // Quando o guia de boas-vindas (primeiros passos nas plataformas) foi enviado.
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS guide_sent_at TIMESTAMPTZ");

  // Integração do CRM ligada para este cliente: a sidebar de agendar, os
  // e-mails e o provisionamento do acesso CRM só valem quando TRUE. Quem já
  // estava no banco entra como TRUE (mantém o CRM). Novo cliente nasce com o
  // padrão global (app_settings.crmEnabled): a partir da virada, quem assina
  // não ganha mais CRM, mas o trabalho de integração fica de pé para religar.
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS crm_enabled BOOLEAN NOT NULL DEFAULT TRUE");
  await postgres.query(
    "ALTER TABLE diagnostics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
  );
  await postgres.query(
    "ALTER TABLE diagnostics ADD COLUMN IF NOT EXISTS questions_version VARCHAR(20)",
  );

  // Diagnóstico 360° + Plano de Ação de cada ciclo. Nasce "pending" (na fila de
  // revisão da equipe) e só aparece para o aluno depois de "approved".
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      cycle INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      content JSONB NOT NULL DEFAULT '{}',
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      agent_versions JSONB,
      requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMPTZ,
      approved_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (member_id, cycle)
    )
  `);

  // O que o próprio empresário registra em cada ação: responsável, prazo e conclusão.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS plan_action_progress (
      plan_id VARCHAR(100) NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      action_id VARCHAR(100) NOT NULL,
      responsible VARCHAR(255),
      due_date DATE,
      completed_at TIMESTAMPTZ,
      PRIMARY KEY (plan_id, action_id)
    )
  `);

  // Atividades práticas semanais: publicadas por plano, iguais para todos daquele plano.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id VARCHAR(100) PRIMARY KEY,
      audience VARCHAR(30) NOT NULL DEFAULT 'all',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due_date DATE,
      published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL
    )
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS activity_progress (
      activity_id VARCHAR(100) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (activity_id, member_id)
    )
  `);

  // Check-in mensal de autogestão: um por pessoa por mês.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      period VARCHAR(7) NOT NULL,
      progress VARCHAR(30) NOT NULL,
      reason VARCHAR(30),
      evolution TEXT,
      feedback TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (member_id, period)
    )
  `);

  // Conversa do suporte: role = user (aluno), assistant (IA) ou team (equipe).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS support_messages_member_idx ON support_messages (member_id, created_at)",
  );

  // Base de conhecimento do assistente de suporte, escrita pela equipe no /adm.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      audience VARCHAR(30) NOT NULL DEFAULT 'all',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL
    )
  `);

  // content = informação que o assistente consulta; rules = regra de conduta que ele segue.
  await postgres.query(
    "ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'content'",
  );

  // Marca de uso indevido na mensagem do cliente (ver support-insights.service).
  await postgres.query("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS flag VARCHAR(30)");
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS support_messages_flag_idx ON support_messages (created_at) WHERE flag IS NOT NULL",
  );

  // Relatório semanal das conversas do suporte, com sugestões de artigo.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS support_insights (
      id VARCHAR(100) PRIMARY KEY,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'generating',
      error TEXT,
      stats JSONB,
      report JSONB,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Resposta em que a IA orienta o cliente a falar com o time humano (WhatsApp).
  await postgres.query("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS handoff BOOLEAN NOT NULL DEFAULT FALSE");

  // Configurações que a equipe muda pelo /adm (ver settings.service).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Consumo da API da IA, uma linha por chamada (ver ai-usage.service).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id VARCHAR(100) PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      model VARCHAR(80),
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query("CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at)");

  // Data da compra de quem foi cadastrado à mão: o dia do mês vira a data de
  // renovação para o lembrete (quem compra pela Hubla usa a data do pagamento).
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS purchase_date DATE");
  await postgres.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS manual_reminded_for DATE");

  // Ingressos dos eventos presenciais (ver event-tickets.service).
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS ticketed BOOLEAN NOT NULL DEFAULT FALSE");
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_tickets (
      id VARCHAR(100) PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      code VARCHAR(20) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, member_id)
    )
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_checkins (
      id VARCHAR(100) PRIMARY KEY,
      ticket_id VARCHAR(100) NOT NULL REFERENCES event_tickets(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      checked_by VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL
    )
  `);

  // Acessos nas plataformas externas (ver provisioning.service): o que deveria
  // estar valendo para cada cliente em cada plataforma e se ela já confirmou.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS external_accounts (
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      platform VARCHAR(30) NOT NULL,
      desired VARCHAR(20) NOT NULL DEFAULT 'active',
      valid_until DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      remote_status VARCHAR(40),
      remote_id VARCHAR(100),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      synced_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, platform)
    )
  `);

  // Ligação dos ingressos com o sistema de credenciamento (ver
  // credenciamento.service): o par do QR code no formato de lá, o que deveria
  // estar valendo e se o credenciamento já confirmou.
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS credenciamento_key VARCHAR(80)");
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS credenciamento_event_id VARCHAR(120)");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS public_id VARCHAR(80)");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS token VARCHAR(160)");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS desired VARCHAR(20) NOT NULL DEFAULT 'active'");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS sync_error TEXT");
  await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ");
  // Quando o cliente foi avisado por e-mail de que o ingresso existe. Ingressos
  // emitidos antes de o aviso existir entram como já avisados.
  const ticketNotice = await postgres.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'event_tickets' AND column_name = 'notified_at'",
  );
  if (ticketNotice.rowCount === 0) {
    await postgres.query("ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ");
    await postgres.query("UPDATE event_tickets SET notified_at = created_at WHERE notified_at IS NULL");
  }

  // Integração do CRM: chamada de vídeo agendada pelo cliente (ver
  // onboarding.service). Um horário em aberto atende um cliente só.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS onboarding_calls (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      whatsapp VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      meet_link TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS onboarding_calls_slot_idx ON onboarding_calls (starts_at) WHERE status = 'scheduled'",
  );
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS onboarding_calls_member_idx ON onboarding_calls (member_id, created_at DESC)",
  );
  // Registro da integração do CRM: o que a equipe fez (obrigatório ao marcar
  // como realizada), o que o aluno registrou (opcional) e o motivo de um
  // reagendamento feito pela equipe.
  await postgres.query("ALTER TABLE onboarding_calls ADD COLUMN IF NOT EXISTS admin_notes TEXT");
  await postgres.query("ALTER TABLE onboarding_calls ADD COLUMN IF NOT EXISTS member_notes TEXT");
  await postgres.query("ALTER TABLE onboarding_calls ADD COLUMN IF NOT EXISTS member_notes_at TIMESTAMPTZ");
  await postgres.query("ALTER TABLE onboarding_calls ADD COLUMN IF NOT EXISTS reschedule_reason TEXT");

  // Atendimento humano pelo chat: fila, quem assumiu e quando terminou.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(100) PRIMARY KEY,
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'waiting',
      assigned_admin_id VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL,
      opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      claimed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ
    )
  `);
  // Um atendimento em aberto por cliente.
  await postgres.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_open_idx ON support_tickets (member_id) WHERE status <> 'closed'",
  );
  // Mensagens trocadas durante um atendimento humano (e os avisos do sistema).
  await postgres.query("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS ticket_id VARCHAR(100)");
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages (ticket_id) WHERE ticket_id IS NOT NULL",
  );

  // Ferramentas e modelos que o cliente baixa (ver tools.service).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS tools (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      category VARCHAR(30) NOT NULL DEFAULT 'geral',
      plan VARCHAR(30) NOT NULL DEFAULT 'essencial',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tudo que a Hubla avisa fica guardado, inclusive o que não gerou ação.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS hubla_events (
      id VARCHAR(100) PRIMARY KEY,
      event_type VARCHAR(150),
      email VARCHAR(255),
      offer_id VARCHAR(100),
      plan VARCHAR(30),
      outcome VARCHAR(50),
      detail TEXT,
      raw JSONB,
      received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query(
    "CREATE INDEX IF NOT EXISTS hubla_events_received_idx ON hubla_events (received_at DESC)",
  );

  // Rascunho escrito pela IA: none (sem IA), queued (na fila), generating,
  // ready (pronto para revisão) ou failed (a equipe escreve à mão ou pede de novo).
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS draft_status VARCHAR(20) NOT NULL DEFAULT 'none'");
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS draft_started_at TIMESTAMPTZ");
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS draft_error TEXT");
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS draft_instructions TEXT");
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS agent_notes JSONB");
  // Quando o aluno abriu o plano/diagnóstico depois de liberado (para o selo "Novo").
  await postgres.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ");
  // Resposta do assistente que resolveu a dúvida sem precisar da equipe.
  await postgres.query("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS resolves BOOLEAN NOT NULL DEFAULT FALSE");
  // Janela de assinatura que dá direito ao ingresso do evento: só quem começou a
  // assinar entre essas datas recebe o ingresso (ex.: Evento Anual pede out/nov 2026).
  // Vazio nos dois = qualquer assinante ativo do plano, como era antes.
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_window_start DATE");
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_window_end DATE");
  // Bônus para os N primeiros assinantes (ex.: Evento Anual e Imersão Presencial para
  // os 100 primeiros). Quem entra entre os primeiros N (por ordem de assinatura)
  // ganha o ingresso. Combina com a janela por OU: vale um critério ou o outro.
  await postgres.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_bonus_limit INTEGER");

  // Assinaturas de cada cliente, conforme os avisos da Hubla. O plano e o
  // acesso do cliente saem daqui: vale o melhor plano entre as ativas.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS member_entitlements (
      member_id VARCHAR(100) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      plan VARCHAR(30) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, plan)
    )
  `);
  // Data da próxima renovação de cada assinatura e para qual data o lembrete
  // já foi enviado (ver renewal.service).
  await postgres.query("ALTER TABLE member_entitlements ADD COLUMN IF NOT EXISTS renews_at TIMESTAMPTZ");
  await postgres.query("ALTER TABLE member_entitlements ADD COLUMN IF NOT EXISTS renewal_reminded_for TIMESTAMPTZ");

  // Versão antiga: o diagnóstico era "liberado" com um parecer escrito à mão.
  // Agora quem é liberado é o plano; diagnóstico enviado sem plano entra na fila.
  await postgres.query("UPDATE diagnostics SET status = 'submitted' WHERE status = 'released'");
  await postgres.query(`
    INSERT INTO plans (id, member_id, cycle, status, content, requested_at)
    SELECT 'plan_' || substr(md5(d.id), 1, 16), d.member_id, 1, 'pending', '{}'::jsonb, d.submitted_at
    FROM diagnostics d
    WHERE d.status = 'submitted'
      AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.member_id = d.member_id)
  `);
}

async function syncProducts() {
  for (const [index, product] of PRODUCTS.entries()) {
    await postgres.query(
      `
        INSERT INTO products (id, slug, name, description, plan, access_url, icon, art, sort_order, internal_page, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          plan = EXCLUDED.plan,
          access_url = COALESCE(products.access_url, EXCLUDED.access_url),
          internal_page = EXCLUDED.internal_page,
          icon = EXCLUDED.icon,
          art = EXCLUDED.art,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        product.id,
        product.slug,
        product.name,
        product.description,
        product.plan,
        product.accessUrl,
        product.icon,
        product.art,
        (index + 1) * 10,
        INTERNAL_PAGES[product.id] || null,
      ],
    );
  }

  await postgres.query(
    "UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_active = TRUE AND id <> ALL($1::text[])",
    [PRODUCTS.map((product) => product.id)],
  );
}

/** Cria as tabelas e atualiza o catálogo. Idempotente; roda uma vez por processo. */
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await createSchema();
      await syncProducts();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

function runStartupMigrations() {
  return ensureSchema().catch((error) =>
    console.error("[migracoes] falha ao preparar o banco", error?.message || error),
  );
}

module.exports = { ensureSchema, runStartupMigrations };
