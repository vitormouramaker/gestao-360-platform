import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { EmptyState, Page, QueryState } from "../../../components/ui/page";
import { authConfig } from "../../../lib/http";
import { useAuthStore } from "../../../store/use-auth-store";
import type { CalendarEvent } from "../../../types/tracking";
import { EventCard } from "./event-card";

interface CalendarPageProps {
  onOpenPremium: () => void;
}

/** Evento já terminou? Sem hora de término, vale 3 horas depois do início. */
export function isPastEvent(event: CalendarEvent, now = Date.now()) {
  const end = event.endsAt
    ? new Date(event.endsAt).getTime()
    : new Date(event.startsAt).getTime() + 3 * 60 * 60 * 1000;
  return end < now;
}

/** Treinamentos ao vivo, encontros mensais e summits presenciais do programa. */
export function CalendarPage({ onOpenPremium }: CalendarPageProps) {
  const userId = useAuthStore((state) => state.user?.id);

  const query = useQuery({
    queryKey: ["events", userId],
    queryFn: async () =>
      (await axios.get<{ events: CalendarEvent[] }>("/api/events", authConfig())).data.events,
  });

  const events = query.data || [];
  const proximos = events.filter((event) => !isPastEvent(event));
  const anteriores = events.filter((event) => isPastEvent(event)).reverse();

  return (
    <Page
      title="Calendário"
      subtitle="Treinamentos ao vivo para o time, encontros mensais e summits presenciais. Os encontros online ficam gravados durante a sua assinatura."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o calendário."
      />

      {query.data && (
        <div className="space-y-10">
          <section aria-labelledby="eventos-proximos">
            <h2 id="eventos-proximos" className="mb-4 text-lg font-bold text-(--text-main)">
              Próximos
            </h2>
            {proximos.length > 0 ? (
              <div className="space-y-3">
                {proximos.map((event) => (
                  <EventCard key={event.id} event={event} onUnlock={onOpenPremium} showTicket />
                ))}
              </div>
            ) : (
              <EmptyState>As próximas datas aparecem aqui assim que forem divulgadas.</EmptyState>
            )}
          </section>

          {anteriores.length > 0 && (
            <section aria-labelledby="eventos-anteriores">
              <h2 id="eventos-anteriores" className="mb-4 text-lg font-bold text-(--text-main)">
                Anteriores
              </h2>
              <div className="space-y-3">
                {anteriores.map((event) => (
                  <EventCard key={event.id} event={event} onUnlock={onOpenPremium} showTicket />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
