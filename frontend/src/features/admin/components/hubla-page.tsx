import { Copy } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { buildApiUrl } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import { toast } from "../../../store/use-toast-store";
import type { HublaEvent } from "../../../types/tracking";
import { useAdminHublaEvents } from "../admin-api";
import { Badge, PlanBadge } from "../admin-shared";

const OUTCOMES: Record<HublaEvent["outcome"], { label: string; tone: "success" | "danger" | "neutral" | "warning" }> = {
  granted: { label: "Acesso liberado", tone: "success" },
  suspended: { label: "Acesso suspenso", tone: "danger" },
  ignored: { label: "Só registrado", tone: "neutral" },
  test: { label: "Teste do painel", tone: "neutral" },
  needs_review: { label: "Conferir", tone: "warning" },
};

/** Integração com a Hubla: endereço do webhook e histórico do que ela avisou. */
export function HublaPage() {
  const query = useAdminHublaEvents();
  const webhookUrl = buildApiUrl("/api/hubla/webhook");
  // Rodando na máquina de alguém, a Hubla não consegue chegar neste endereço.
  const isLocal = /localhost|127\.0\.0\.1/.test(webhookUrl);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Endereço copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  };

  return (
    <Page
      title="Hubla"
      subtitle="Quem compra na Hubla ganha acesso sozinho. Aqui ficam o endereço do webhook e o histórico de tudo que a Hubla avisou."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os avisos da Hubla."
      />

      {query.data && (
        <div className="space-y-8">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-(--text-main)">Endereço do webhook</h2>
              {query.data.configured ? (
                <Badge tone="success">Token configurado</Badge>
              ) : (
                <Badge tone="warning">Falta o token</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-(--text-muted)">
              É o que vai no campo "URL" da regra de webhook da Hubla.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-(--bg-surface-muted) px-3 py-2.5 text-sm text-(--text-main)">
                {webhookUrl}
              </code>
              <Button variant="secondary" onClick={copyUrl}>
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
            {isLocal && (
              <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                Este endereço é da sua máquina: a Hubla não consegue alcançá-lo. O endereço definitivo
                existe quando a API estiver publicada em um domínio.
              </p>
            )}
            {!query.data.configured && (
              <p className="mt-3 text-sm text-(--text-muted)">
                Enquanto o token da regra não for gravado no servidor (HUBLA_WEBHOOK_TOKEN), o
                endereço recusa qualquer aviso.
              </p>
            )}
          </Card>

          <section aria-labelledby="hubla-historico">
            <h2 id="hubla-historico" className="mb-4 text-lg font-bold text-(--text-main)">
              Últimos avisos recebidos
            </h2>
            {query.data.events.length === 0 ? (
              <EmptyState>Nenhum aviso recebido ainda.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {query.data.events.map((event) => {
                  const outcome = OUTCOMES[event.outcome] || OUTCOMES.ignored;
                  return (
                    <li key={event.id}>
                      <Card className="p-4 sm:p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={outcome.tone}>{outcome.label}</Badge>
                          {event.plan && <PlanBadge plan={event.plan} />}
                          <code className="text-xs text-(--text-main)">{event.eventType}</code>
                          <span className="ml-auto text-xs text-(--text-muted)">
                            {formatDateTime(event.receivedAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-(--text-main)">
                          {event.email && <strong>{event.email}: </strong>}
                          {event.detail}
                        </p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-bold text-(--text-muted)">
                            Ver o que a Hubla mandou
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-(--bg-surface-muted) p-3 text-xs text-(--text-main)">
                            {JSON.stringify(event.raw, null, 2)}
                          </pre>
                        </details>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
