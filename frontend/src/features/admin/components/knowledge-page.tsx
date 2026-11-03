import { useRef, useState } from "react";
import { FileUp, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ConfirmButton } from "../../../components/ui/confirm-button";
import { Field, Select, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { FILE_TEXT_ACCEPT, readFileText } from "../../../lib/file-text";
import { formatDate } from "../../../lib/format";
import { toast } from "../../../store/use-toast-store";
import type { KnowledgeArticle, KnowledgeAudience, KnowledgeKind } from "../../../types/tracking";
import { useAdminAction, useAdminKnowledge } from "../admin-api";
import { Badge } from "../admin-shared";

const EMPTY_FORM = {
  title: "",
  content: "",
  kind: "content" as KnowledgeKind,
  audience: "all" as KnowledgeAudience,
  active: true,
};

const number = new Intl.NumberFormat("pt-BR");

/**
 * Base de conhecimento do assistente de suporte. O que a equipe escreve aqui
 * é lido pela IA a cada resposta: vale assim que o artigo é salvo.
 */
export function KnowledgePage() {
  const query = useAdminKnowledge();
  const action = useAdminAction();
  // null = fechado; "new" = criando; artigo = editando.
  const [editing, setEditing] = useState<KnowledgeArticle | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const data = query.data;
  const articles = data?.articles || [];
  const articleLimit = data?.limits.article || 0;
  const totalLimit = data?.limits.total || 0;
  const used = data?.activeChars || 0;
  const usedPercent = totalLimit ? Math.min(Math.round((used / totalLimit) * 100), 100) : 0;
  const tooLong = articleLimit > 0 && form.content.length > articleLimit;

  const openForm = (article: KnowledgeArticle | "new") => {
    setForm(
      article === "new"
        ? EMPTY_FORM
        : {
            title: article.title,
            content: article.content,
            kind: article.kind,
            audience: article.audience,
            active: article.active,
          },
    );
    setEditing(article);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo.
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const text = await readFileText(file);
      setForm((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.[^.]+$/, ""),
        content: current.content ? `${current.content}\n\n${text}` : text,
      }));
      toast.success("Texto importado.", { message: "Revise antes de salvar: a IA vai ler exatamente o que está no campo." });
    } catch (error) {
      toast.error("Não foi possível ler o arquivo.", {
        message: error instanceof Error ? error.message : "Tente outro arquivo ou cole o texto.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    try {
      await action.mutateAsync(
        editing === "new"
          ? { method: "post", path: "/knowledge", body: form, success: "Artigo salvo. A IA já usa este conteúdo." }
          : { method: "patch", path: `/knowledge/${editing.id}`, body: form, success: "Artigo atualizado." },
      );
      setEditing(null);
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  return (
    <Page
      title="Base de conhecimento"
      subtitle="O que a IA de suporte sabe sobre o programa. Escreva ou importe o conteúdo oficial: regras, perguntas frequentes, como cada entregável funciona. Vale assim que você salva."
      actions={
        <Button onClick={() => openForm("new")}>
          <Plus className="h-4 w-4" />
          Novo artigo
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar a base de conhecimento."
      />

      {data && (
        <div className="space-y-5">
          {!data.agentConfigured && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              A IA de suporte está desligada neste ambiente. Os artigos ficam guardados e passam a
              valer quando ela for ligada.
            </p>
          )}

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-(--text-main)">Espaço usado pelos artigos ativos</h2>
              <p className="text-sm tabular-nums text-(--text-muted)">
                {number.format(used)} de {number.format(totalLimit)} caracteres ({usedPercent}%)
              </p>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-(--bg-surface-muted)"
              role="progressbar"
              aria-label="Espaço usado pelos artigos ativos"
              aria-valuenow={usedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-(--primary)" style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="mt-3 text-xs font-medium text-(--text-muted)">
              A IA lê todos os artigos ativos a cada pergunta, por isso existe um limite. Prefira
              textos diretos: uma pergunta e a resposta oficial rendem mais do que um documento longo.
              Vídeo e áudio não entram: use a transcrição ou um resumo.
            </p>
          </Card>

          {articles.length === 0 && (
            <EmptyState>
              Nenhum artigo ainda. A IA responde só com o que já sabe sobre a plataforma e encaminha o
              resto para a equipe.
            </EmptyState>
          )}

          <div className="space-y-3">
            {articles.map((article) => (
              <Card key={article.id} className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {article.active ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Desativado</Badge>
                    )}
                    {article.kind === "rules" && <Badge tone="warning">Regras de conduta</Badge>}
                    {article.audience === "premium" && <Badge tone="neutral">Só Premium</Badge>}
                    <span className="text-xs text-(--text-muted)">
                      {number.format(article.chars)} caracteres · atualizado em {formatDate(article.updatedAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-bold text-(--text-main)">{article.title}</h2>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-(--text-muted)">
                    {article.content}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openForm(article)}
                    aria-label={`Editar: ${article.title}`}
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton
                    label={article.title}
                    disabled={action.isPending}
                    onConfirm={() =>
                      action.mutate({ method: "delete", path: `/knowledge/${article.id}`, success: "Artigo excluído." })
                    }
                  />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo artigo" : "Editar artigo"}
        onClose={() => setEditing(null)}
        className="sm:max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="artigo-form" disabled={action.isPending || importing || tooLong}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </>
        }
      >
        <form id="artigo-form" onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Título"
            htmlFor="artigo-titulo"
            hint="Diga do que o artigo trata. Ex.: Política de cancelamento e reembolso."
          >
            <Input
              id="artigo-titulo"
              value={form.title}
              maxLength={255}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label htmlFor="artigo-conteudo" className="block text-[13px] font-bold text-(--text-main)">
                Conteúdo
              </label>
              <input
                ref={fileInput}
                type="file"
                accept={FILE_TEXT_ACCEPT}
                onChange={handleFile}
                className="hidden"
                aria-label="Arquivo para importar"
              />
              <Button
                type="button"
                variant="soft"
                disabled={importing}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Importar PDF, Word ou texto
              </Button>
            </div>
            <Textarea
              id="artigo-conteudo"
              rows={14}
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              required
            />
            <p
              className={
                tooLong ? "text-xs font-bold text-rose-600" : "text-xs font-medium text-(--text-muted)"
              }
            >
              {number.format(form.content.length)} de {number.format(articleLimit)} caracteres por artigo.
              {tooLong && " Passou do limite: resuma ou divida em mais de um artigo."}
            </p>
          </div>

          <Field
            label="Tipo"
            htmlFor="artigo-tipo"
            hint={
              form.kind === "rules"
                ? "A IA segue este texto como ordem. Use para dizer o que ela pode ou não falar."
                : "A IA consulta este texto para responder, mas não obedece a ordens escritas nele."
            }
          >
            <Select
              id="artigo-tipo"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as KnowledgeKind })}
            >
              {(data?.kinds || []).map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Para quem vale"
              htmlFor="artigo-publico"
              hint="Conteúdo só do Premium não é usado nas respostas a clientes do Essencial."
            >
              <Select
                id="artigo-publico"
                value={form.audience}
                onChange={(event) => setForm({ ...form, audience: event.target.value as KnowledgeAudience })}
              >
                {(data?.audiences || []).map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Situação"
              htmlFor="artigo-situacao"
              hint="Desativado fica guardado, mas a IA não usa."
            >
              <Select
                id="artigo-situacao"
                value={form.active ? "ativo" : "desativado"}
                onChange={(event) => setForm({ ...form, active: event.target.value === "ativo" })}
              >
                <option value="ativo">Ativo</option>
                <option value="desativado">Desativado</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
