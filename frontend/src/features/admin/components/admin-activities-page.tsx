import { useState } from "react";
import { CalendarDays, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ConfirmButton } from "../../../components/ui/confirm-button";
import { Field, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, ProgressBar, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import type { AdminActivity } from "../../../types/tracking";
import { useAdminAction, useAdminActivities } from "../admin-api";

const EMPTY_FORM = { title: "", description: "", dueDate: "" };

/**
 * Atividades práticas semanais, entregável do Premium. Cada publicação vale
 * para todos os clientes Premium: não são individuais por aluno.
 */
export function AdminActivitiesPage() {
  const query = useAdminActivities();
  const action = useAdminAction();
  // null = fechado; "new" = criando; atividade = editando.
  const [editing, setEditing] = useState<AdminActivity | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const activities = query.data?.activities || [];

  const openForm = (activity: AdminActivity | "new") => {
    setForm(
      activity === "new"
        ? EMPTY_FORM
        : {
            title: activity.title,
            description: activity.description || "",
            dueDate: activity.dueDate || "",
          },
    );
    setEditing(activity);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    try {
      await action.mutateAsync(
        editing === "new"
          ? { method: "post", path: "/activities", body: form, success: "Atividade publicada." }
          : { method: "patch", path: `/activities/${editing.id}`, body: form, success: "Atividade atualizada." },
      );
      setEditing(null);
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  return (
    <Page
      title="Atividades práticas"
      subtitle="Publique a atividade da semana. Ela aparece para todos os clientes Premium, e cada um marca a sua como feita."
      actions={
        <Button onClick={() => openForm("new")}>
          <Plus className="h-4 w-4" />
          Nova atividade
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as atividades."
      />

      {query.data && activities.length === 0 && (
        <EmptyState>Nenhuma atividade publicada ainda.</EmptyState>
      )}

      <div className="space-y-3">
        {activities.map((activity) => (
          <Card key={activity.id} className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-(--text-muted)">
                  Publicada em {formatDate(activity.publishedAt)}
                </span>
                {activity.dueDate && (
                  <span className="inline-flex items-center gap-1 text-xs text-(--text-muted)">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Até {formatDate(activity.dueDate)}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-base font-bold text-(--text-main)">{activity.title}</h2>
              {activity.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-muted)">{activity.description}</p>
              )}
              <div className="mt-3 max-w-sm">
                <p className="mb-1 text-xs font-bold text-(--text-muted)">Clientes Premium que já fizeram</p>
                <ProgressBar done={activity.doneCount} total={activity.audienceCount} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openForm(activity)}
                aria-label={`Editar: ${activity.title}`}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <ConfirmButton
                label={activity.title}
                disabled={action.isPending}
                onConfirm={() =>
                  action.mutate({ method: "delete", path: `/activities/${activity.id}`, success: "Atividade excluída." })
                }
              />
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Nova atividade" : "Editar atividade"}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="atividade-form" disabled={action.isPending}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing === "new" ? "Publicar" : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="atividade-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Título" htmlFor="atividade-titulo">
            <Input
              id="atividade-titulo"
              value={form.title}
              maxLength={255}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </Field>
          <Field label="O que fazer (opcional)" htmlFor="atividade-descricao">
            <Textarea
              id="atividade-descricao"
              rows={5}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Field label="Fazer até (opcional)" htmlFor="atividade-prazo">
            <Input
              id="atividade-prazo"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </Page>
  );
}
