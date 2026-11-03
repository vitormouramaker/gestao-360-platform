const nodemailer = require('nodemailer');
const { finishLog, publicApiUrl, startLog } = require('../services/email-log.service');

// Sem SMTP no .env (ambiente local), nada sai da máquina: o e-mail é montado
// e os links dele são impressos no console, para dar para testar os fluxos de
// criar senha e recuperar senha.
const SMTP_CONFIGURED = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

const transporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 465,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : nodemailer.createTransport({ jsonTransport: true });

function logLocalMail(to, subject, html) {
  const links = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]))];
  console.log(`[e-mail local] para ${to}: ${subject}`);
  links.forEach((link) => console.log(`  link: ${link}`));
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5180').replace(/\/+$/, '');
}

// Layout único dos e-mails transacionais. Textos já devem vir escapados.
function renderEmailLayout({ title, paragraphs, buttonLabel, buttonUrl, footer }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #132B40;">
      <h2 style="color: #159B7B;">${title}</h2>
      ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}
      <a href="${buttonUrl}" style="display: inline-block; padding: 12px 24px; background-color: #159B7B; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">
        ${buttonLabel}
      </a>
      <p style="margin-top: 20px; font-size: 13px; color: #667580;">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br />
        <span style="word-break: break-all;">${buttonUrl}</span>
      </p>
      <p style="margin-top: 12px; font-size: 13px; color: #667580;">${footer}</p>
    </div>
  `;
}

/**
 * Envia um e-mail. Com track = { memberId, kind, manual? }, o envio fica no
 * registro do aluno (email-log.service) e leva uma imagem invisível que marca
 * quando ele foi aberto.
 */
async function sendMail({ to, subject, html, track }) {
  const logId = track?.memberId
    ? await startLog({ memberId: track.memberId, kind: track.kind, subject, to, manual: track.manual })
    : null;
  const apiUrl = logId ? publicApiUrl() : '';
  const body = apiUrl
    ? `${html}<img src="${apiUrl}/api/e/${logId}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />`
    : html;

  try {
    const info = await transporter.sendMail({
      from: `"Gestão 360°" <${process.env.SMTP_USER || 'nao-responda@example.com'}>`,
      to,
      subject,
      html: body,
    });
    if (SMTP_CONFIGURED) console.log('Message sent: %s', info.messageId);
    else logLocalMail(to, subject, html);
    await finishLog(logId, { sent: true, messageId: info.messageId });
    return true;
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error?.message || error);
    await finishLog(logId, { sent: false, error: error?.message || error });
    return false;
  }
}

function sendResetPasswordEmail(toEmail, resetToken, track) {
  const resetLink = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;

  return sendMail({
    track,
    to: toEmail,
    subject: 'Recuperação de senha - Gestão 360°',
    html: renderEmailLayout({
      title: 'Recuperação de senha',
      paragraphs: [
        'Você solicitou a redefinição da sua senha na plataforma Gestão 360°.',
        'Para criar uma nova senha, clique no botão abaixo:',
      ],
      buttonLabel: 'Redefinir minha senha',
      buttonUrl: resetLink,
      footer:
        'Se você não solicitou esta alteração, pode ignorar este e-mail de forma segura. O link expira em 1 hora.',
    }),
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Boas-vindas de quem acabou de comprar: o link leva para a tela de criar a senha. */
function sendWelcomeEmail({ to, name, planName, url, track }) {
  const link = url;
  const primeiroNome = String(name || '').trim().split(' ')[0];

  return sendMail({
    track,
    to,
    subject: 'Seu acesso ao Gestão 360° está liberado',
    html: renderEmailLayout({
      title: 'Bem-vindo ao Gestão 360°',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `Sua <strong>${escapeHtml(planName)}</strong> está ativa e a plataforma já está pronta para você.`,
        'Crie a sua senha no botão abaixo. No primeiro acesso você responde a anamnese da sua empresa, que é o ponto de partida do seu Diagnóstico 360°.',
      ],
      buttonLabel: 'Criar minha senha',
      buttonUrl: link,
      footer:
        'O link vale por 7 dias. Se ele expirar, abra a plataforma e use "Esqueceu a senha?" com este mesmo e-mail.',
    }),
  });
}

/**
 * Guia de boas-vindas da compra: os primeiros passos no 360 e como ativar o
 * acesso às outras plataformas. É o mesmo roteiro da página /obrigado.
 */
function sendWelcomeGuideEmail({ to, name, planName, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const passo = (numero, titulo, texto) => `<strong>${numero}. ${titulo}</strong><br />${texto}`;

  return sendMail({
    track,
    to,
    subject: 'Boas-vindas ao Gestão 360°: seus primeiros passos',
    html: renderEmailLayout({
      title: '🎉 Seja muito bem-vindo(a) ao Gestão 360°',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        // Mensagem de boas-vindas da equipe: a mesma da página /obrigado.
        'Parabéns pela sua decisão de investir no crescimento e na gestão do seu negócio! 🚀',
        `Você acaba de adquirir um programa de <strong>12 meses</strong> na modalidade de pagamento recorrente (<strong>${escapeHtml(planName)}</strong>), e estamos muito felizes em ter você conosco nessa jornada de desenvolvimento, aprendizado e transformação.`,
        '📩 <strong>Atenção ao seu e-mail!</strong> Os seus acessos já foram enviados para que você possa começar a usufruir de todos os benefícios do programa. O passo a passo está logo abaixo.',
        'Dentro da nossa plataforma, você terá acesso à Academy, à Formação Executiva, a conteúdos e a ferramentas desenvolvidos para contribuir com o seu crescimento como empresário(a) e com a evolução da gestão da sua empresa.',
        '📄 Nos próximos dias, a nossa equipe entra em contato para encaminhar o contrato para a sua assinatura, formalizando a nossa parceria.',
        'Estamos montando o grupo e em breve vamos adicioná-lo(a).',
        'Conte conosco nessa jornada! Que esses próximos 12 meses sejam de muito aprendizado, crescimento e grandes resultados. Vamos juntos elevar o nível da sua gestão! 🚀',
        '<strong>Seus primeiros passos</strong><br />Tudo acontece na plataforma da Gestão 360: você não precisa usar a área de membros da Hubla. Guarde este e-mail, ele é o seu roteiro de início.',
        passo(1, 'Crie a sua senha', 'Você recebeu outro e-mail nosso, "Seu acesso ao Gestão 360° está liberado". Clique em "Criar minha senha". Ele chega no mesmo e-mail usado na compra.'),
        passo(2, 'Entre na plataforma e responda a anamnese', 'Ela é o ponto de partida do seu Diagnóstico 360° e leva de 10 a 12 minutos.'),
        passo(3, 'Ative os outros acessos', 'Cada plataforma incluída na sua assinatura manda o próprio e-mail, também para o e-mail da compra:<br />• <strong>CRM</strong>: "Seu acesso ao CRM está liberado: finalize seu cadastro". Clique em "Finalizar cadastro" e crie a senha.<br />• <strong>Formação Executiva</strong>: o e-mail traz o seu login e uma senha provisória.<br />• <strong>Academy</strong>: o e-mail traz o seu login e uma senha provisória.'),
        passo(4, 'Agende a sua integração do CRM', 'Dentro da plataforma, no menu "Integração CRM", escolha um dia e um horário para uma chamada de vídeo com o nosso time.'),
        passo(5, 'Fique de olho no calendário', 'Lá estão os treinamentos ao vivo, os encontros mensais e os eventos presenciais. O ingresso dos eventos presenciais do seu plano aparece no Calendário, com QR code.'),
        '<strong>Não achou algum e-mail?</strong> Espere alguns minutos e confira o lixo eletrônico, o spam e a aba de promoções. Se o e-mail de acesso não chegar, abra a plataforma e use "Esqueceu a senha?" com o e-mail da compra, ou escreva para contato@example.com.',
      ],
      buttonLabel: 'Acessar a plataforma',
      buttonUrl: getFrontendUrl(),
      footer: 'Você recebe este e-mail porque assinou o Gestão 360°.',
    }),
  });
}

/** Acesso de administrador: o link leva para a tela de criar a senha. */
function sendAdminAccessEmail({ to, name, url, track }) {
  const link = url;
  const primeiroNome = String(name || '').trim().split(' ')[0];

  return sendMail({
    track,
    to,
    subject: 'Seu acesso de administrador ao Gestão 360°',
    html: renderEmailLayout({
      title: 'Acesso de administrador',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        'Você recebeu um acesso de administrador à plataforma Gestão 360°. Com ele você entra no painel da equipe, em /adm, para acompanhar alunos, revisar planos e cuidar do atendimento.',
        'Crie a sua senha no botão abaixo. Depois, entre com este e-mail e a senha que você criou.',
      ],
      buttonLabel: 'Criar minha senha',
      buttonUrl: link,
      footer:
        'O link vale por 7 dias. Se ele expirar, abra a plataforma e use "Esqueceu a senha?" com este mesmo e-mail. Se você não esperava este acesso, avise contato@example.com.',
    }),
  });
}

/** Aviso ao cliente: o Diagnóstico/Plano foi revisado e liberado pela equipe. */
function sendPlanReadyEmail({ to, name, firstCycle, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const oque = firstCycle ? 'o seu Diagnóstico 360°' : 'o seu novo plano de ação';

  return sendMail({
    track,
    to,
    subject: firstCycle
      ? 'Seu Diagnóstico 360° está pronto'
      : 'Seu novo plano de ação está pronto',
    html: renderEmailLayout({
      title: firstCycle ? 'Seu Diagnóstico 360° está pronto' : 'Seu novo plano de ação está pronto',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `A nossa equipe revisou as suas respostas e liberou ${oque} na plataforma.`,
        'Abra para ver a leitura do momento da sua empresa, a prioridade que vem primeiro e o seu próximo passo.',
      ],
      buttonLabel: firstCycle ? 'Ver o meu diagnóstico' : 'Ver o meu plano',
      buttonUrl: `${getFrontendUrl()}/diagnostico`,
      footer: 'Você recebe este e-mail porque é assinante do Gestão 360°.',
    }),
  });
}

/** Aviso para a equipe: uma mensagem do suporte foi marcada como uso indevido grave. */
function sendSupportAlertEmail({ to, memberName, memberEmail, flagLabel, content }) {
  return sendMail({
    to,
    subject: `Suporte: ${flagLabel} - Gestão 360°`,
    html: renderEmailLayout({
      title: 'Uso indevido do suporte',
      paragraphs: [
        `A assistente de suporte marcou uma mensagem como <strong>${escapeHtml(flagLabel)}</strong>.`,
        `Cliente: ${escapeHtml(memberName)} (${escapeHtml(memberEmail)})`,
        `Mensagem: <em>${escapeHtml(String(content).slice(0, 600))}</em>`,
        'A classificação é feita pela IA e pode estar errada. Confira a conversa antes de agir.',
      ],
      buttonLabel: 'Abrir o painel',
      buttonUrl: `${getFrontendUrl()}/adm/uso-do-suporte`,
      footer: 'Você recebe este aviso por ser administrador da plataforma.',
    }),
  });
}

/** Lembrete ao cliente: a assinatura renova nos próximos dias. */
function sendRenewalReminderEmail({ to, name, planName, renewsAt, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  // Data de cadastro manual vem como dia puro (meia-noite UTC): formatada em
  // UTC para não voltar um dia. As da Hubla trazem hora e usam o fuso local.
  const quando = new Date(renewsAt);
  const diaPuro = quando.getUTCHours() === 0 && quando.getUTCMinutes() === 0 && quando.getUTCSeconds() === 0;
  const data = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: diaPuro ? 'UTC' : 'America/Sao_Paulo',
  }).format(quando);

  return sendMail({
    track,
    to,
    subject: `Sua assinatura do Gestão 360° renova em ${data}`,
    html: renderEmailLayout({
      title: 'Sua assinatura renova em breve',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `Sua <strong>${escapeHtml(planName)}</strong> renova em <strong>${escapeHtml(data)}</strong>.`,
        'Se o pagamento é por cartão, a cobrança acontece sozinha: confira apenas se o cartão está válido e com limite. Se você paga por Pix ou boleto, a cobrança chega por e-mail e precisa ser paga até essa data.',
        'Sem a confirmação do pagamento, o acesso à plataforma e aos entregáveis do programa é interrompido na hora.',
      ],
      buttonLabel: 'Abrir a plataforma',
      buttonUrl: getFrontendUrl(),
      footer: 'Se o pagamento já foi feito, pode desconsiderar este aviso.',
    }),
  });
}

/** Período do evento por extenso, no fuso  Brasília. */
function formatEventPeriod(startsAt, endsAt) {
  const dia = (value) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(value));
  const inicio = dia(startsAt);
  const fim = endsAt ? dia(endsAt) : inicio;
  return inicio === fim ? inicio : `${inicio} a ${fim}`;
}

/** Aviso ao cliente: o ingresso dele para um evento presencial foi emitido. */
function sendTicketIssuedEmail({ to, name, eventTitle, startsAt, endsAt, location, code, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const quando = formatEventPeriod(startsAt, endsAt);
  const onde = String(location || '').trim();

  return sendMail({
    track,
    to,
    subject: `Seu ingresso para ${eventTitle} está disponível`,
    html: renderEmailLayout({
      title: 'Seu ingresso foi gerado',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `Seu ingresso para <strong>${escapeHtml(eventTitle)}</strong> já está na plataforma Gestão 360°.`,
        `<strong>Quando:</strong> ${escapeHtml(quando)}${onde ? `<br /><strong>Onde:</strong> ${escapeHtml(onde)}` : ''}<br /><strong>Código do ingresso:</strong> ${escapeHtml(code)}`,
        'Para ver o QR code, entre na plataforma, abra o Calendário e clique em "Meu ingresso" no evento. Apresente o QR code na entrada, no celular ou impresso.',
        'O ingresso é pessoal e vale enquanto a sua assinatura estiver ativa na data do evento.',
      ],
      buttonLabel: 'Ver meu ingresso',
      buttonUrl: `${getFrontendUrl()}/calendario`,
      footer:
        'Ainda não criou a sua senha? Use o botão do e-mail de boas-vindas ou "Esqueceu a senha?" na tela de acesso, com este mesmo e-mail.',
    }),
  });
}

/** Dia e hora de uma chamada, no fuso  Brasília: "quinta-feira, 15 de outubro, às 14h". */
function formatCallTime(startsAt) {
  const quando = new Date(startsAt);
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(quando);
  const [hora, minuto] = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Sao_Paulo',
  })
    .format(quando)
    .split(':');
  return `${dia}, às ${Number(hora)}h${minuto === '00' ? '' : minuto} (horário de Brasília)`;
}

/** Confirmação ao cliente: a chamada de integração do CRM foi agendada. */
function sendOnboardingBookedEmail({ to, name, startsAt, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const quando = formatCallTime(startsAt);

  return sendMail({
    track,
    to,
    subject: 'Sua integração do CRM está agendada',
    html: renderEmailLayout({
      title: 'Integração do CRM agendada',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `Sua chamada de integração do CRM com o time da Gestão 360 está marcada para <strong>${escapeHtml(quando)}</strong>.`,
        'O link da chamada de vídeo será enviado pelo seu WhatsApp e também aparece na plataforma, em Integração CRM.',
        'Se precisar mudar o horário, é só reagendar por lá.',
      ],
      buttonLabel: 'Ver meu agendamento',
      buttonUrl: `${getFrontendUrl()}/integracao-crm`,
      footer: 'Você recebe este e-mail porque agendou a integração do CRM na plataforma Gestão 360°.',
    }),
  });
}

/** Aviso ao cliente: a equipe cadastrou o link da chamada de integração. */
function sendOnboardingLinkEmail({ to, name, startsAt, meetLink, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const quando = formatCallTime(startsAt);

  return sendMail({
    track,
    to,
    subject: 'O link da sua integração do CRM está disponível',
    html: renderEmailLayout({
      title: 'Link da sua integração do CRM',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `O link da sua chamada de integração do CRM já está disponível. Ela acontece <strong>${escapeHtml(quando)}</strong>.`,
        'No horário, é só clicar no botão abaixo. O link também fica na plataforma, em Integração CRM.',
      ],
      buttonLabel: 'Entrar na chamada',
      buttonUrl: escapeHtml(meetLink),
      footer: 'Se precisar mudar o horário, reagende na plataforma Gestão 360°, em Integração CRM.',
    }),
  });
}

/** Aviso ao cliente: a equipe remarcou a chamada de integração, com o motivo. */
function sendOnboardingRescheduledEmail({ to, name, startsAt, reason, meetLink, track }) {
  const primeiroNome = String(name || '').trim().split(' ')[0];
  const quando = formatCallTime(startsAt);

  return sendMail({
    track,
    to,
    subject: 'A sua integração do CRM foi remarcada',
    html: renderEmailLayout({
      title: 'Integração do CRM remarcada',
      paragraphs: [
        primeiroNome ? `Olá, ${escapeHtml(primeiroNome)}!` : 'Olá!',
        `A nossa equipe remarcou a sua chamada de integração do CRM para <strong>${escapeHtml(quando)}</strong>.`,
        `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
        meetLink
          ? 'O link da chamada continua o mesmo e está na plataforma, em Integração CRM.'
          : 'O link da chamada aparece na plataforma, em Integração CRM, e é enviado a você antes do horário.',
      ],
      buttonLabel: 'Ver o meu agendamento',
      buttonUrl: `${getFrontendUrl()}/integracao-crm`,
      footer: 'Se o novo horário não servir, reagende na plataforma, em Integração CRM.',
    }),
  });
}

/** Aviso para a equipe: um cliente agendou, reagendou ou cancelou a integração do CRM. */
function sendOnboardingTeamEmail({ to, memberName, memberEmail, whatsapp, startsAt, kind }) {
  return sendMail({
    to,
    subject: `Integração CRM: ${memberName} ${kind} - Gestão 360°`,
    html: renderEmailLayout({
      title: `Integração do CRM: cliente ${escapeHtml(kind)}`,
      paragraphs: [
        `<strong>${escapeHtml(memberName)}</strong> (${escapeHtml(memberEmail)}) ${escapeHtml(kind)} a chamada de integração do CRM.`,
        `<strong>Quando:</strong> ${escapeHtml(formatCallTime(startsAt))}<br /><strong>WhatsApp:</strong> ${escapeHtml(whatsapp)}`,
        kind === 'cancelou'
          ? 'O horário voltou a ficar livre para outros clientes.'
          : 'Cadastre o link da chamada no painel: o cliente passa a ver o link na plataforma e é avisado por e-mail.',
      ],
      buttonLabel: 'Abrir os agendamentos',
      buttonUrl: `${getFrontendUrl()}/adm/integracao-crm`,
      footer: 'Você recebe este aviso por ser o contato de suporte da plataforma.',
    }),
  });
}

/** Aviso para a equipe: um cliente entrou na fila de atendimento do chat. */
function sendSupportQueueEmail({ to, memberName, memberEmail }) {
  return sendMail({
    to,
    subject: 'Suporte: cliente na fila de atendimento - Gestão 360°',
    html: renderEmailLayout({
      title: 'Cliente na fila de atendimento',
      paragraphs: [
        `<strong>${escapeHtml(memberName)}</strong> (${escapeHtml(memberEmail)}) pediu para falar com a equipe pelo chat da plataforma.`,
        'Quem assumir o atendimento passa a responder sozinho, até finalizar.',
      ],
      buttonLabel: 'Abrir a fila de atendimento',
      buttonUrl: `${getFrontendUrl()}/adm/atendimento`,
      footer: 'Você recebe este aviso por ser o contato de suporte da plataforma.',
    }),
  });
}

module.exports = {
  sendRenewalReminderEmail,
  sendSupportQueueEmail,
  sendOnboardingBookedEmail,
  sendOnboardingLinkEmail,
  sendOnboardingRescheduledEmail,
  sendOnboardingTeamEmail,
  sendTicketIssuedEmail,
  sendSupportAlertEmail,
  sendResetPasswordEmail,
  sendWelcomeEmail,
  sendPlanReadyEmail,
  sendAdminAccessEmail,
  sendWelcomeGuideEmail,
};
