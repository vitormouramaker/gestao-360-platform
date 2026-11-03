import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ConfirmButton } from "../../../components/ui/confirm-button";
import { Field, Select, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { EmptyState, Page, QueryState } from "../../../components/ui/page";
import { fromDateTimeLocal, toDateTimeLocal } from "../../../lib/format";
import type { PlanId } from "../../../types/catalog";
import type { CalendarEvent, EventType } from "../../../types/tracking";
import { isPastEvent } from "../../calendar/components/calendar-page";
import { EventCard } from "../../calendar/components/event-card";
import { useAdminAction, useAdminEvents } from "../admin-api";

const EMPTY_FORM = {
  type: "treinamento" as EventType,
  plan: "essencial" as PlanId,
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  meetingUrl: "",
  recordingUrl: "",
  ticketed: false,
  ticketWindowStart: "",
  ticketWindowEnd: "",
  ticketBonusLimit: "",
};

/** Datas dos treinamentos ao vivo, encontros mensais e summits presenciais. */
export function EventsPage() {
  const query = useAdminEvents();
  const action = useAdminAction();
  // null = fechado; "new" = criando; evento = editando.
  const [editing, setEditing] = useState<CalendarEvent | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const events = query.data?.events || [];
  const proximos = events.filter((event) => !isPastEvent(event));
  const anteriores = events.filter((event) => isPastEvent(event)).reverse();

  const openForm = (event: CalendarEvent | "new") => {
    setForm(
      event === "new"
        ? EMPTY_FORM
        : {
            type: event.type,
            plan: event.plan,
            title: event.title,
            description: event.description || "",
            startsAt: toDateTimeLocal(event.startsAt),
            endsAt: toDateTimeLocal(event.endsAt),
            location: event.location || "",
            meetingUrl: event.meetingUrl || "",
            recordingUrl: event.recordingUrl || "",
            ticketed: event.ticketed,
            ticketWindowStart: event.ticketWindowStart || "",
            ticketWindowEnd: event.ticketWindowEnd || "",
            ticketBonusLimit: event.ticketBonusLimit != null ? String(event.ticketBonusLimit) : "",
          },
    );
    setEditing(event);
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!editing) return;

    const body = {
      ...form,
      startsAt: fromDateTimeLocal(form.startsAt),
      endsAt: fromDateTimeLocal(form.endsAt),
    };

    try {
      await action.mutateAsync(
        editing === "new"
          ? { method: "post", path: "/events", body, success: "Evento criado." }
          : { method: "patch", path: `/events/${editing.id}`, body, success: "Evento atualizado." },
      );
      setEditing(null);
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  const renderList = (list: CalendarEvent[]) => (
    <div className="space-y-3">
      {list.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          actions={
            <>
              <button
                type="button"
                onClick={() => openForm(event)}
                aria-label={`Editar: ${event.title}`}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <ConfirmButton
                label={event.title}
                disabled={action.isPending}
                onConfirm={() =>
                  action.mutate({ method: "delete", path: `/events/${event.id}`, success: "Evento excluído." })
                }
              />
            </>
          }
        />
      ))}
    </div>
  );

  return (
    <Page
      title="Calendário"
      subtitle="Marque os treinamentos ao vivo, encontros mensais e summits presenciais. Eventos do Premium aparecem bloqueados para quem está no Essencial."
      actions={
        <Button onClick={() => openForm("new")}>
          <Plus className="h-4 w-4" />
          Novo evento
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o calendário."
      />

      {query.data && (
        <div className="space-y-10">
          <section aria-labelledby="adm-eventos-proximos">
            <h2 id="adm-eventos-proximos" className="mb-4 text-lg font-bold text-(--text-main)">
              Próximos
            </h2>
            {proximos.length > 0 ? renderList(proximos) : <EmptyState>Nenhum evento marcado.</EmptyState>}
          </section>

          {anteriores.length > 0 && (
            <section aria-labelledby="adm-eventos-anteriores">
              <h2 id="adm-eventos-anteriores" className="mb-1 text-lg font-bold text-(--text-main)">
                Anteriores
              </h2>
              <p className="mb-4 text-sm text-(--text-muted)">
                Edite um evento para incluir o link da gravação.
              </p>
              {renderList(anteriores)}
            </section>
          )}
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo evento" : "Editar evento"}
        onClose={() => setEditing(null)}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="evento-form" disabled={action.isPending}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </>
        }
      >
        <form id="evento-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="evento-tipo">
            <Select
              id="evento-tipo"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as EventType })}
            >
              {(query.data?.types || []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quem participa" htmlFor="evento-plano">
            <Select
              id="evento-plano"
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value as PlanId })}
            >
              <option value="essencial">Essencial e Premium</option>
              <option value="premium">Só Premium</option>
            </Select>
          </Field>
          <Field label="Título" htmlFor="evento-titulo" className="sm:col-span-2">
            <Input
              id="evento-titulo"
              value={form.title}
              maxLength={255}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </Field>
          <Field label="Início" htmlFor="evento-inicio">
            <Input
              id="evento-inicio"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              required
            />
          </Field>
          <Field label="Término (opcional)" htmlFor="evento-fim">
            <Input
              id="evento-fim"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            />
          </Field>
          <Field label="Local (opcional)" htmlFor="evento-local" hint="Para os summits presenciais." className="sm:col-span-2">
            <Input
              id="evento-local"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--border-subtle) p-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.ticketed}
              onChange={(event) => setForm({ ...form, ticketed: event.target.checked })}
              className="mt-0.5 h-4 w-4 accent-(--primary)"
            />
            <span>
              <span className="block text-sm font-bold text-(--text-main)">Evento presencial com ingresso</span>
              <span className="block text-xs font-medium text-(--text-muted)">
                O aluno do plano vê o botão Meu ingresso, com QR code. Na entrada, o ingresso só passa
                se a assinatura estiver ativa naquele momento.
              </span>
            </span>
          </label>
          {form.ticketed && (
            <div className="grid gap-4 rounded-xl border border-(--border-subtle) p-3 sm:col-span-2 sm:grid-cols-2">
              <p className="text-xs font-medium text-(--text-muted) sm:col-span-2">
                Janela de assinatura (opcional): só recebe o ingresso quem começou a assinar entre estas
                datas. Deixe em branco para liberar a qualquer assinante ativo do plano.
              </p>
              <Field label="Assinou a partir de" htmlFor="evento-janela-inicio">
                <Input
                  id="evento-janela-inicio"
                  type="date"
                  value={form.ticketWindowStart}
                  onChange={(event) => setForm({ ...form, ticketWindowStart: event.target.value })}
                />
              </Field>
              <Field label="Assinou até" htmlFor="evento-janela-fim">
                <Input
                  id="evento-janela-fim"
                  type="date"
                  value={form.ticketWindowEnd}
                  onChange={(event) => setForm({ ...form, ticketWindowEnd: event.target.value })}
                />
              </Field>
              <Field
                label="Bônus: primeiros N assinantes (opcional)"
                htmlFor="evento-bonus"
                className="sm:col-span-2"
              >
                <Input
                  id="evento-bonus"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Ex.: 100"
                  value={form.ticketBonusLimit}
                  onChange={(event) => setForm({ ...form, ticketBonusLimit: event.target.value })}
                />
                <p className="mt-1 text-xs font-medium text-(--text-muted)">
                  Dá o ingresso aos N primeiros a assinar o 360 (por ordem de assinatura). Vale junto
                  com a janela acima: o aluno ganha se estiver na janela OU entre os primeiros N.
                </p>
              </Field>
            </div>
          )}
          <Field label="Link da transmissão (opcional)" htmlFor="evento-link">
            <Input
              id="evento-link"
              type="url"
              placeholder="https://"
              value={form.meetingUrl}
              onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })}
            />
          </Field>
          <Field label="Link da gravação (opcional)" htmlFor="evento-gravacao">
            <Input
              id="evento-gravacao"
              type="url"
              placeholder="https://"
              value={form.recordingUrl}
              onChange={(event) => setForm({ ...form, recordingUrl: event.target.value })}
            />
          </Field>
          <Field label="Descrição (opcional)" htmlFor="evento-descricao" className="sm:col-span-2">
            <Textarea
              id="evento-descricao"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </Page>
  );
}
