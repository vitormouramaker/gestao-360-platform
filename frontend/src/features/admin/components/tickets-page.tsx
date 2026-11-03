import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Send, Undo2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDateTime } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { AdminTicket } from "../../../types/tracking";
import { MessageBubble } from "../../support/components/support-chat";
import { useAdminAction, useAdminTicket, useAdminTickets } from "../admin-api";
import { Badge, PlanBadge } from "../admin-shared";

function TicketRow({
  ticket,
  selected,
  onSelect,
  children,
}: {
  ticket: AdminTicket;
  selected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        selected ? "border-(--primary) bg-(--bg-surface-muted)" : "border-(--border-subtle) bg-(--bg-surface)",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="min-w-0 flex-1 cursor-pointer text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-(--text-main)">{ticket.memberName}</span>
          <PlanBadge plan={ticket.memberPlan} />
        </span>
        <span className="mt-0.5 block text-xs text-(--text-muted)">
          {ticket.status === "closed"
            ? `Finalizado em ${formatDateTime(ticket.closedAt)}${ticket.adminName ? ` por ${ticket.adminName}` : ""}`
            : ticket.status === "active"
              ? `Em atendimento desde ${formatDateTime(ticket.claimedAt)}`
              : `Na fila desde ${formatDateTime(ticket.openedAt)}`}
        </span>
      </button>
      {children}
    </li>
  );
}

/** Conversa do atendimento escolhido, com resposta para quem o assumiu. */
function TicketConversation({ ticketId, adminId }: { ticketId: string; adminId: string | undefined }) {
  const query = useAdminTicket(ticketId);
  const action = useAdminAction();
  const [reply, setReply] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const data = query.data;
  const total = (data?.context.length || 0) + (data?.messages.length || 0);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [total]);

  if (!data) {
    return (
      <Card>
        <QueryState
          isPending={query.isPending}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          errorMessage="Este atendimento não está disponível: pode ter sido assumido por outra pessoa."
        />
      </Card>
    );
  }

  const { ticket } = data;
  const mine = ticket.status === "active" && ticket.adminId === adminId;
  const run = (path: string, success?: string) =>
    action.mutate({ method: "post", path: `/tickets/${ticket.id}/${path}`, success });

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = reply.trim();
    if (!content) return;
    try {
      await action.mutateAsync({
        method: "post",
        path: `/tickets/${ticket.id}/messages`,
        body: { content },
        silent: true,
      });
      setReply("");
    } catch {
      // O aviso de erro já foi exibido; o texto fica no campo.
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-(--text-main)">{ticket.memberName}</h2>
          <p className="text-sm text-(--text-muted)">{ticket.memberEmail}</p>
        </div>
        {ticket.status === "waiting" && (
          <Button disabled={action.isPending} onClick={() => run("claim")}>
            Assumir atendimento
          </Button>
        )}
        {mine && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={action.isPending} onClick={() => run("release")}>
              <Undo2 className="h-4 w-4" />
              Devolver à fila
            </Button>
            <Button disabled={action.isPending} onClick={() => run("close")}>
              <CheckCircle2 className="h-4 w-4" />
              Finalizar
            </Button>
          </div>
        )}
        {ticket.status === "closed" && <Badge tone="neutral">Finalizado</Badge>}
      </div>

      <ul
        ref={listRef}
        aria-live="polite"
        className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto rounded-xl border border-(--border-subtle) p-4"
      >
        {data.context.length > 0 && (
          <li className="text-center text-[11px] font-bold uppercase tracking-wider text-(--text-muted)">
            Antes do atendimento (conversa com a IA)
          </li>
        )}
        {data.context.map((message) => (
          <MessageBubble key={message.id} message={message} viewer="team" />
        ))}
        {data.messages.map((message) => (
          <MessageBubble key={message.id} message={message} viewer="team" />
        ))}
      </ul>

      {ticket.status === "waiting" && (
        <p className="mt-4 text-sm text-(--text-muted)">
          Assuma o atendimento para responder. A partir daí só você fala com este aluno, e a conversa
          some da fila dos outros administradores até você finalizar.
        </p>
      )}

      {mine && (
        <form onSubmit={handleSend} className="mt-4 flex items-end gap-2">
          <textarea
            rows={2}
            aria-label="Sua resposta"
            placeholder="Escreva a resposta..."
            maxLength={2000}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              // Enter envia; Shift+Enter quebra a linha.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="g360-ui-input min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
          />
          <Button type="submit" disabled={!reply.trim() || action.isPending}>
            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </form>
      )}
    </Card>
  );
}

/**
 * Atendimento humano pelo chat. O aluno que pede para falar com a equipe entra
 * na fila; quem assume fica sozinho na conversa até finalizar.
 */
export function TicketsPage({ adminId }: { adminId: string | undefined }) {
  const query = useAdminTickets();
  const action = useAdminAction();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = query.data;

  // Sem nada escolhido, abre o primeiro atendimento em andamento ou da fila.
  const fallbackId = data?.mine[0]?.id || data?.waiting[0]?.id || null;
  const activeId = selectedId || fallbackId;

  const claim = async (ticket: AdminTicket) => {
    try {
      await action.mutateAsync({ method: "post", path: `/tickets/${ticket.id}/claim` });
      setSelectedId(ticket.id);
    } catch {
      // Outra pessoa assumiu antes: o aviso já apareceu e a fila se atualiza.
    }
  };

  return (
    <Page
      title="Atendimento"
      subtitle="Alunos que pediram para falar com a equipe pelo chat. Quem assume o atendimento responde sozinho; os outros administradores só voltam a ver a conversa depois de finalizada."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os atendimentos."
      />

      {data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start">
          <div className="space-y-6">
            <section aria-labelledby="atendimento-fila">
              <h2 id="atendimento-fila" className="mb-3 text-lg font-bold text-(--text-main)">
                Fila ({data.waiting.length})
              </h2>
              {data.waiting.length === 0 ? (
                <EmptyState>Ninguém esperando.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {data.waiting.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      selected={ticket.id === activeId}
                      onSelect={() => setSelectedId(ticket.id)}
                    >
                      <Button variant="soft" disabled={action.isPending} onClick={() => void claim(ticket)}>
                        Assumir
                      </Button>
                    </TicketRow>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="atendimento-meus">
              <h2 id="atendimento-meus" className="mb-3 text-lg font-bold text-(--text-main)">
                Com você ({data.mine.length})
              </h2>
              {data.mine.length === 0 ? (
                <EmptyState>Você não está em nenhum atendimento.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {data.mine.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      selected={ticket.id === activeId}
                      onSelect={() => setSelectedId(ticket.id)}
                    />
                  ))}
                </ul>
              )}
              {data.othersActive > 0 && (
                <p className="mt-3 text-sm text-(--text-muted)">
                  {data.othersActive} atendimento(s) em andamento com outras pessoas da equipe.
                </p>
              )}
            </section>

            {data.closed.length > 0 && (
              <section aria-labelledby="atendimento-finalizados">
                <h2 id="atendimento-finalizados" className="mb-3 text-lg font-bold text-(--text-main)">
                  Finalizados
                </h2>
                <ul className="space-y-2">
                  {data.closed.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      selected={ticket.id === activeId}
                      onSelect={() => setSelectedId(ticket.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>

          {activeId ? (
            <TicketConversation key={activeId} ticketId={activeId} adminId={adminId} />
          ) : (
            <EmptyState>Escolha um atendimento para ver a conversa.</EmptyState>
          )}
        </div>
      )}
    </Page>
  );
}
