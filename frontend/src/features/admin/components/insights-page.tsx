import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Select, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import type { InsightSuggestion, KnowledgeAudience, SupportInsight } from "../../../types/tracking";
import { useAdminAction, useAdminInsights } from "../admin-api";
import { Badge } from "../admin-shared";

const HANDLED = {
  respondida: { label: "Respondida pela IA", tone: "success" },
  encaminhada: { label: "Encaminhada à equipe", tone: "warning" },
  sem_resposta: { label: "Sem resposta", tone: "danger" },
} as const;

const PLACEHOLDER = /\[PREENCHER/i;

function InsightReport({
  insight,
  onReview,
  onDismiss,
  busy,
}: {
  insight: SupportInsight;
  onReview: (suggestion: InsightSuggestion) => void;
  onDismiss: (suggestion: InsightSuggestion) => void;
  busy: boolean;
}) {
  const report = insight.report;
  if (!report) return null;

  return (
    <div className="space-y-5">
      <p className="whitespace-pre-wrap text-sm text-(--text-main)">{report.overview}</p>

      {insight.stats && (
        <p className="text-xs font-medium text-(--text-muted)">
          {insight.stats.conversations} conversa(s), {insight.stats.userMessages} mensagem(ns) de clientes,{" "}
          {insight.stats.flagged} marcada(s) como uso indevido.
          {insight.stats.conversationsRead < insight.stats.conversations &&
            ` A IA leu ${insight.stats.conversationsRead} conversa(s): o restante passou do limite de leitura.`}
        </p>
      )}

      {report.topQuestions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-(--text-main)">Dúvidas mais frequentes</h3>
          <ul className="space-y-2">
            {report.topQuestions.map((item, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 text-sm text-(--text-main)">
                <span className="font-bold tabular-nums">{item.count}x</span>
                <span className="min-w-0 flex-1">{item.question}</span>
                <Badge tone={HANDLED[item.handled].tone}>{HANDLED[item.handled].label}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.gaps.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-(--text-main)">O que a IA não soube responder</h3>
          <ul className="space-y-2">
            {report.gaps.map((item, index) => (
              <li key={index} className="text-sm text-(--text-main)">
                <span className="font-bold tabular-nums">{item.count}x</span> {item.question}
                {item.note && <span className="block text-xs text-(--text-muted)">{item.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-(--text-main)">
          Sugestões de artigo ({report.suggestions.length})
        </h3>
        {report.suggestions.length === 0 && (
          <p className="text-sm text-(--text-muted)">Nenhuma sugestão neste período.</p>
        )}
        <div className="space-y-3">
          {report.suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-muted) p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {suggestion.status === "approved" && <Badge tone="success">Virou artigo</Badge>}
                {suggestion.status === "dismissed" && <Badge tone="neutral">Descartada</Badge>}
                {suggestion.status === "pending" && PLACEHOLDER.test(suggestion.content) && (
                  <Badge tone="warning">Falta informação oficial</Badge>
                )}
                <h4 className="text-sm font-bold text-(--text-main)">{suggestion.title}</h4>
              </div>
              <p className="mt-1 text-xs font-medium text-(--text-muted)">{suggestion.reason}</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-(--text-main)">
                {suggestion.content}
              </p>
              {suggestion.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="soft" disabled={busy} onClick={() => onReview(suggestion)}>
                    Revisar e aprovar
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => onDismiss(suggestion)}>
                    Descartar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Aprendizado da IA: uma vez por semana a IA lê as conversas do suporte e
 * sugere artigos para a base de conhecimento. Nada entra na base sem que
 * alguém da equipe revise e aprove aqui.
 */
export function InsightsPage() {
  const query = useAdminInsights();
  const action = useAdminAction();
  const [reviewing, setReviewing] = useState<{ insightId: string; suggestion: InsightSuggestion } | null>(null);
  const [form, setForm] = useState({ title: "", content: "", audience: "all" as KnowledgeAudience });

  const data = query.data;
  const insights = data?.insights || [];
  const generating = insights.some((insight) => insight.status === "generating");
  const stillOpen = PLACEHOLDER.test(form.content);

  const openReview = (insightId: string, suggestion: InsightSuggestion) => {
    setForm({ title: suggestion.title, content: suggestion.content, audience: "all" });
    setReviewing({ insightId, suggestion });
  };

  const handleApprove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewing) return;
    try {
      await action.mutateAsync({
        method: "post",
        path: `/insights/${reviewing.insightId}/suggestions/${reviewing.suggestion.id}`,
        body: { action: "approve", ...form },
      });
      setReviewing(null);
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  return (
    <Page
      title="Aprendizado da IA"
      subtitle="Uma vez por semana a IA lê as conversas do suporte, mostra o que os clientes mais perguntaram, o que ela não soube responder e sugere artigos novos. Nada entra na base de conhecimento sem a sua aprovação."
      actions={
        <Button
          disabled={action.isPending || generating || !data?.agentConfigured}
          onClick={() => action.mutate({ method: "post", path: "/insights/generate" })}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Gerar relatório agora
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os relatórios."
      />

      {data && (
        <div className="space-y-5">
          {!data.agentConfigured && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              A IA está desligada neste ambiente, então nenhum relatório é gerado.
            </p>
          )}

          {insights.length === 0 && (
            <EmptyState>
              Nenhum relatório ainda. O primeiro sai sozinho quando houver conversas de clientes, ou
              você pode gerar agora.
            </EmptyState>
          )}

          {insights.map((insight, index) => (
            <Card key={insight.id}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-(--text-main)">
                  {formatDate(insight.periodStart)} a {formatDate(insight.periodEnd)}
                </h2>
                {index === 0 && insight.status === "ready" && <Badge tone="success">Mais recente</Badge>}
                {insight.status === "failed" && <Badge tone="danger">Falhou</Badge>}
              </div>

              {insight.status === "generating" && (
                <p role="status" className="flex items-center gap-2 text-sm text-(--text-muted)">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A IA está lendo as conversas. Leva alguns minutos; esta tela atualiza sozinha.
                </p>
              )}
              {insight.status === "failed" && (
                <p className="text-sm text-(--text-muted)">{insight.error || "Tente gerar de novo."}</p>
              )}
              {insight.status === "ready" && (
                <InsightReport
                  insight={insight}
                  busy={action.isPending}
                  onReview={(suggestion) => openReview(insight.id, suggestion)}
                  onDismiss={(suggestion) =>
                    action.mutate({
                      method: "post",
                      path: `/insights/${insight.id}/suggestions/${suggestion.id}`,
                      body: { action: "dismiss" },
                    })
                  }
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={reviewing !== null}
        title="Revisar sugestão de artigo"
        onClose={() => setReviewing(null)}
        className="sm:max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="sugestao-form" disabled={action.isPending || stillOpen}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Aprovar e criar artigo
            </Button>
          </>
        }
      >
        <form id="sugestao-form" onSubmit={handleApprove} className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            O texto foi escrito pela IA a partir das conversas. Confira cada informação: depois de
            aprovado, a IA de suporte passa a responder com ele.
          </p>
          <Field label="Título" htmlFor="sugestao-titulo">
            <Input
              id="sugestao-titulo"
              value={form.title}
              maxLength={255}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </Field>
          <Field
            label="Conteúdo"
            htmlFor="sugestao-conteudo"
            hint={
              stillOpen
                ? "Há trechos marcados com [PREENCHER]: a IA não encontrou a resposta oficial. Complete ou apague para poder aprovar."
                : undefined
            }
          >
            <Textarea
              id="sugestao-conteudo"
              rows={14}
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              required
            />
          </Field>
          <Field label="Para quem vale" htmlFor="sugestao-publico">
            <Select
              id="sugestao-publico"
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
        </form>
      </Modal>
    </Page>
  );
}
