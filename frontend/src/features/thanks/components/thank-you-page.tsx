import { useEffect } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LifeBuoy,
  Mail,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Logo360 } from "../../../components/brand/logo-360";
import { navigate } from "../../../lib/navigation";

const SUPPORT_EMAIL = "contato@example.com";

/** Página fora da busca: só chega aqui quem acabou de comprar. */
function useNoIndex() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Compra confirmada | Gestão 360°";

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);

    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);
}

function Step({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: number;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="g360-auth-card flex gap-4 rounded-2xl border p-5 sm:p-6">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-(--primary) text-base font-extrabold text-white"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-start gap-2 text-base font-bold text-(--text-main) sm:text-lg">
          <span className="sr-only">Passo {number}: </span>
          <span className="flex-1">{title}</span>
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-(--primary-text)" aria-hidden="true" />
        </h3>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-(--text-muted)">{children}</div>
      </div>
    </li>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-(--text-main)">{children}</strong>;
}

/**
 * Página de obrigado: o comprador cai aqui depois de pagar na Hubla. É pública
 * (sem login e sem menu) e explica os próximos passos até o primeiro acesso.
 */
export function ThankYouPage() {
  useNoIndex();

  const openInApp = (path: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(path);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="g360-auth-screen min-h-dvh px-4 py-10">
      <main className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <Logo360 className="mx-auto w-40 text-(--text-main)" />
          <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-(--primary)/12 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-(--primary-text)">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Compra confirmada
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-(--text-main) sm:text-4xl">
            🎉 Seja muito bem-vindo(a) ao Gestão 360°
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base font-medium text-(--text-main)">
            Parabéns pela sua decisão de investir no crescimento e na gestão do seu negócio! 🚀
          </p>
        </header>

        {/* Mensagem de boas-vindas da equipe: o mesmo texto do e-mail de boas-vindas. */}
        <section className="g360-auth-card mt-8 space-y-3 rounded-3xl border p-6 text-sm font-medium leading-relaxed text-(--text-muted) sm:p-8 sm:text-base">
          <p>
            Você acaba de adquirir um programa de <Strong>12 meses</Strong> na modalidade de
            pagamento recorrente, e estamos muito felizes em ter você conosco nessa jornada de
            desenvolvimento, aprendizado e transformação.
          </p>
          <p>
            📩 <Strong>Atenção ao seu e-mail!</Strong> Verifique a sua caixa de entrada: os seus
            acessos já foram enviados para que você possa começar a usufruir de todos os benefícios
            do programa.
          </p>
          <p>
            Dentro da nossa plataforma, você terá acesso à Academy, à Formação Executiva, a conteúdos
            e a ferramentas desenvolvidos para contribuir com o seu crescimento como empresário(a) e
            com a evolução da gestão da sua empresa.
          </p>
          <p>
            📄 Nos próximos dias, a nossa equipe entra em contato para encaminhar o contrato para a
            sua assinatura, formalizando a nossa parceria.
          </p>
          <p>Estamos montando o grupo e em breve vamos adicioná-lo(a).</p>
          <p>
            Conte conosco nessa jornada! Que esses próximos 12 meses sejam de muito aprendizado,
            crescimento e grandes resultados.
          </p>
          <p className="font-bold text-(--text-main)">
            Vamos juntos elevar o nível da sua gestão! 🚀
          </p>
          <p className="text-sm">
            Tudo acontece na plataforma da Gestão 360: você não precisa usar a área de membros da Hubla.
          </p>
        </section>

        <section aria-labelledby="obrigado-passos" className="mt-10">
          <h2 id="obrigado-passos" className="text-xl font-extrabold text-(--text-main)">
            Seus próximos passos
          </h2>

          <ol className="mt-4 space-y-3">
            <Step number={1} icon={Mail} title="Abra o seu e-mail">
              <p>
                Em alguns minutos você recebe o e-mail{" "}
                <Strong>“Seu acesso ao Gestão 360° está liberado”</Strong>, enviado para o{" "}
                <Strong>mesmo e-mail usado na compra</Strong>. Abra a mensagem e clique em{" "}
                <Strong>“Criar minha senha”</Strong>.
              </p>
              <p>Não encontrou? Confira o spam, o lixo eletrônico e a aba Promoções.</p>
            </Step>

            <Step number={2} icon={ClipboardList} title="Entre na plataforma e responda a anamnese">
              <p>
                A anamnese é o ponto de partida do seu <Strong>Diagnóstico 360°</Strong> e leva de 10
                a 12 minutos.
              </p>
              <a
                href="/"
                onClick={openInApp("/")}
                className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--primary) px-6 text-sm font-bold text-white transition hover:bg-(--primary-hover) sm:w-auto"
              >
                Acessar a plataforma
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Step>

            <Step number={3} icon={KeyRound} title="Ative os outros acessos">
              <p>
                A sua assinatura inclui outras plataformas, e cada uma envia um e-mail separado:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <Strong>CRM:</Strong> o e-mail “Seu acesso ao CRM está liberado: finalize seu
                  cadastro” traz o link para você criar a sua senha.
                </li>
                <li>
                  <Strong>Formação Executiva</Strong> e <Strong>Academy:</Strong> cada e-mail traz o
                  login e uma senha provisória.
                </li>
              </ul>
              <p>Todos chegam no mesmo e-mail da compra. Se não encontrar algum, confira o spam.</p>
            </Step>

            <Step number={4} icon={Video} title="Agende a sua integração do CRM">
              <p>
                Dentro da plataforma, abra o menu <Strong>“Integração CRM”</Strong> e escolha um dia
                e um horário para uma chamada de vídeo com o nosso time.
              </p>
            </Step>

            <Step number={5} icon={CalendarDays} title="Fique de olho no calendário">
              <p>
                É lá que ficam as sessões ao vivo, os encontros mensais e os eventos presenciais. Os
                ingressos dos eventos presenciais incluídos no seu plano aparecem no{" "}
                <Strong>Calendário</Strong>, com QR code.
              </p>
            </Step>
          </ol>
        </section>

        <section
          aria-labelledby="obrigado-ajuda"
          className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 sm:p-6"
        >
          <h2 id="obrigado-ajuda" className="flex items-center gap-2 text-base font-bold">
            <LifeBuoy className="h-5 w-5 shrink-0" aria-hidden="true" />
            Não recebeu o e-mail?
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>Aguarde alguns minutos: o envio pode levar um pouco.</li>
            <li>Confira o spam, o lixo eletrônico e a aba Promoções.</li>
            <li>Confirme qual e-mail você usou na compra.</li>
            <li>
              Na tela de login da plataforma, clique em <strong>“Esqueceu a senha?”</strong> e informe
              esse e-mail.
            </li>
            <li>
              Se ainda assim não chegar, escreva para{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
              .
            </li>
          </ol>
        </section>

        <footer className="mt-8 text-center text-xs font-medium text-(--text-muted)">
          <a
            href="/termos"
            onClick={openInApp("/termos")}
            className="font-bold underline underline-offset-2"
          >
            Termos de Uso
          </a>{" "}
          e{" "}
          <a
            href="/privacidade"
            onClick={openInApp("/privacidade")}
            className="font-bold underline underline-offset-2"
          >
            Política de Privacidade
          </a>
        </footer>
      </main>
    </div>
  );
}
