import { useState } from "react";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Card, Page, QueryState } from "../../../components/ui/page";
import { formatDate, formatDateTime } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { useAdminAction, useAdminEventTicket } from "../admin-api";
import { PlanBadge } from "../admin-shared";

function TicketResult({ code }: { code: string }) {
  const query = useAdminEventTicket(code);
  const action = useAdminAction();
  const ticket = query.data;

  if (!ticket) {
    return (
      <Card>
        <QueryState
          isPending={query.isPending}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          errorMessage="Ingresso não encontrado. Confira o código."
        />
      </Card>
    );
  }

  return (
    <Card className={ticket.valid ? "border-emerald-400" : "border-rose-400"}>
      <div role="status" className="flex items-start gap-3">
        {ticket.valid ? (
          <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-8 w-8 shrink-0 text-rose-600" />
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-(--text-main)">
            {ticket.valid ? "Ingresso válido" : "Entrada não permitida"}
          </h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            {ticket.valid
              ? "Assinatura ativa neste momento. Confira o nome com um documento."
              : ticket.reason}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-(--border-subtle) pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">Cliente</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-(--text-main)">
            <button
              type="button"
              onClick={() => navigate(`/adm/alunos/${encodeURIComponent(ticket.holder.id)}`)}
              className="cursor-pointer underline-offset-2 hover:underline"
            >
              {ticket.holder.name}
            </button>
            <PlanBadge plan={ticket.holder.plan} />
          </dd>
          <dd className="text-sm text-(--text-muted)">{ticket.holder.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">Evento</dt>
          <dd className="mt-1 text-base font-bold text-(--text-main)">{ticket.event.title}</dd>
          <dd className="text-sm text-(--text-muted)">
            {formatDate(ticket.event.startsAt)}
            {ticket.event.endsAt ? ` a ${formatDate(ticket.event.endsAt)}` : ""}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-(--border-subtle) pt-5">
        <h3 className="text-sm font-bold text-(--text-main)">Entradas registradas ({ticket.checkins.length})</h3>
        {ticket.checkins.length === 0 ? (
          <p className="mt-1 text-sm text-(--text-muted)">Nenhuma entrada ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-(--text-main)">
            {ticket.checkins.map((checkin, index) => (
              <li key={index}>
                {formatDateTime(checkin.checkedAt)}
                {checkin.adminName ? ` · por ${checkin.adminName}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs font-medium text-(--text-muted)">
          Em evento de vários dias, registre uma entrada por dia.
        </p>
      </div>

      <div className="mt-5">
        <Button
          disabled={!ticket.valid || action.isPending}
          onClick={() => action.mutate({ method: "post", path: `/event-tickets/${ticket.code}/checkin` })}
        >
          {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Registrar entrada
        </Button>
      </div>
    </Card>
  );
}

/**
 * Conferência de ingresso na entrada do evento. O QR code do ingresso abre
 * esta tela já com o código; também dá para digitar o código à mão.
 */
export function TicketCheckPage({ code }: { code: string | null }) {
  const [typed, setTyped] = useState("");

  return (
    <Page
      title="Ingressos"
      subtitle="Leia o QR code do ingresso com a câmera do celular, logado como administrador, ou digite o código. O ingresso só passa se a assinatura do cliente estiver ativa neste momento."
    >
      <form
        className="mb-6 flex max-w-xl items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = typed.trim();
          if (value) navigate(`/adm/ingresso/${encodeURIComponent(value)}`);
        }}
      >
        <Field label="Código do ingresso" htmlFor="ingresso-codigo" className="flex-1">
          <Input
            id="ingresso-codigo"
            placeholder="ABCDE-FGHJK"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value.toUpperCase())}
          />
        </Field>
        <Button type="submit" disabled={!typed.trim()}>
          <Search className="h-4 w-4" />
          Conferir
        </Button>
      </form>

      {code && <TicketResult key={code} code={code} />}
    </Page>
  );
}
