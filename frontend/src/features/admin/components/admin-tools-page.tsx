import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ConfirmButton } from "../../../components/ui/confirm-button";
import { Field, Select, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import type { PlanId } from "../../../types/catalog";
import type { Tool } from "../../../types/tracking";
import { useAdminAction, useAdminTools } from "../admin-api";
import { Badge, PlanBadge } from "../admin-shared";

const EMPTY_FORM = {
  title: "",
  description: "",
  url: "",
  category: "geral",
  plan: "essencial" as PlanId,
  active: true,
};

/**
 * Ferramentas e modelos que o aluno baixa. A IA de suporte e o agente do
 * plano recebem esta lista: só indicam material que estiver publicado aqui.
 */
export function AdminToolsPage() {
  const query = useAdminTools();
  const action = useAdminAction();
  // null = fechado; "new" = criando; material = editando.
  const [editing, setEditing] = useState<Tool | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const tools = query.data?.tools || [];

  const openForm = (tool: Tool | "new") => {
    setForm(
      tool === "new"
        ? EMPTY_FORM
        : {
            title: tool.title,
            description: tool.description,
            url: tool.url,
            category: tool.category,
            plan: tool.plan,
            active: tool.active,
          },
    );
    setEditing(tool);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await action.mutateAsync(
        editing === "new"
          ? { method: "post", path: "/tools", body: form }
          : { method: "patch", path: `/tools/${editing.id}`, body: form },
      );
      setEditing(null);
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  return (
    <Page
      title="Ferramentas e modelos"
      subtitle="Planilhas, modelos e checklists que o aluno baixa pelo menu Ferramentas e modelos. A IA de suporte e a IA que escreve o plano só indicam o que estiver publicado aqui, pelo título."
      actions={
        <Button onClick={() => openForm("new")}>
          <Plus className="h-4 w-4" />
          Novo material
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as ferramentas."
      />

      {query.data && tools.length === 0 && <EmptyState>Nenhum material publicado ainda.</EmptyState>}

      <div className="space-y-3">
        {tools.map((tool) => (
          <Card key={tool.id} className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{tool.categoryLabel}</Badge>
                <PlanBadge plan={tool.plan} />
                {!tool.active && <Badge tone="warning">Desativado</Badge>}
              </div>
              <h2 className="mt-2 text-base font-bold text-(--text-main)">{tool.title}</h2>
              {tool.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-muted)">{tool.description}</p>
              )}
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-bold text-(--primary-text) underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{tool.url}</span>
              </a>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openForm(tool)}
                aria-label={`Editar: ${tool.title}`}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <ConfirmButton
                label={tool.title}
                disabled={action.isPending}
                onConfirm={() => action.mutate({ method: "delete", path: `/tools/${tool.id}` })}
              />
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo material" : "Editar material"}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="material-form" disabled={action.isPending}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing === "new" ? "Publicar" : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="material-form" onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Título"
            htmlFor="material-titulo"
            hint="É por este nome que a IA indica o material. Ex.: Modelo de DRE gerencial simples."
          >
            <Input
              id="material-titulo"
              value={form.title}
              maxLength={255}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </Field>
          <Field
            label="Para que serve (opcional)"
            htmlFor="material-descricao"
            hint="Uma ou duas frases. A IA usa este texto para saber quando indicar o material."
          >
            <Textarea
              id="material-descricao"
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Field
            label="Link do arquivo"
            htmlFor="material-link"
            hint="Endereço completo, começando com https://. Use um link que qualquer pessoa consiga abrir (Google Drive, OneDrive, Dropbox ou outro)."
          >
            <Input
              id="material-link"
              type="url"
              placeholder="https://"
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assunto" htmlFor="material-assunto">
              <Select
                id="material-assunto"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {(query.data?.categories || []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Plano" htmlFor="material-plano" hint="Premium inclui tudo do Essencial.">
              <Select
                id="material-plano"
                value={form.plan}
                onChange={(event) => setForm({ ...form, plan: event.target.value as PlanId })}
              >
                <option value="essencial">Essencial e Premium</option>
                <option value="premium">Só Premium</option>
              </Select>
            </Field>
          </div>
          <Field label="Situação" htmlFor="material-situacao" hint="Desativado some do menu do aluno e da IA.">
            <Select
              id="material-situacao"
              value={form.active ? "ativo" : "desativado"}
              onChange={(event) => setForm({ ...form, active: event.target.value === "ativo" })}
            >
              <option value="ativo">Ativo</option>
              <option value="desativado">Desativado</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </Page>
  );
}
