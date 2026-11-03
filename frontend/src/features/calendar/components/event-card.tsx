import { useState } from "react";
import { CalendarDays, Lock, MapPin, PlayCircle, Ticket, Video } from "lucide-react";
import { Card } from "../../../components/ui/page";
import { formatDateTime } from "../../../lib/format";
import { PLAN_NAMES } from "../../../types/catalog";
import type { CalendarEvent } from "../../../types/tracking";
import { TicketModal } from "./ticket-modal";

interface EventCardProps {
  event: CalendarEvent;
  /** Ações extras (o painel /adm usa para editar e excluir). */
  actions?: React.ReactNode;
  /** Toque em um evento bloqueado (abre a oferta do Premium). */
  onUnlock?: () => void;
  /** Mostra o botão do ingresso (só na área do aluno). */
  showTicket?: boolean;
}

const linkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--primary) px-3 text-xs font-bold text-white transition-colors hover:bg-(--primary-hover)";

/** Um evento do calendário: treinamento, encontro mensal ou summit. */
export function EventCard({ event, actions, onUnlock, showTicket }: EventCardProps) {
  const [ticketOpen, setTicketOpen] = useState(false);

  return (
    <Card className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-(--primary)/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-(--primary-text)">
            {event.typeLabel}
          </span>
          {event.plan === "premium" && (
            <span className="rounded-full border border-(--border-strong) px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-(--text-main)">
              {PLAN_NAMES.premium}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-base font-bold text-(--text-main)">{event.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-(--text-main)">
          <CalendarDays className="h-4 w-4 shrink-0 text-(--text-muted)" />
          {formatDateTime(event.startsAt)}
        </p>
        {event.location && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-(--text-muted)">
            <MapPin className="h-4 w-4 shrink-0" />
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-(--text-muted)">{event.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {event.locked ? (
            <button
              type="button"
              onClick={onUnlock}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--border-strong) px-3 text-xs font-bold text-(--text-main) transition-colors hover:bg-(--bg-surface-muted)"
            >
              <Lock className="h-3.5 w-3.5" />
              Disponível na Assinatura Anual
            </button>
          ) : (
            <>
              {showTicket && event.ticketed && (
                <button type="button" onClick={() => setTicketOpen(true)} className={`${linkClass} cursor-pointer`}>
                  <Ticket className="h-4 w-4" />
                  Meu ingresso
                </button>
              )}
              {event.meetingUrl && (
                <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <Video className="h-4 w-4" />
                  Entrar na transmissão
                </a>
              )}
              {event.recordingUrl && (
                <a href={event.recordingUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <PlayCircle className="h-4 w-4" />
                  Assistir à gravação
                </a>
              )}
            </>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      {ticketOpen && <TicketModal event={event} onClose={() => setTicketOpen(false)} />}
    </Card>
  );
}
