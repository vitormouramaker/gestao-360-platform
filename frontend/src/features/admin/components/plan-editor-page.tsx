import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, CheckCircle2, Circle, Download, Eye, Loader2, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { CityUfField } from "../../../components/ui/city-uf-field";
import { Field, Select, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, Page, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { navigate } from "../../../lib/navigation";
import { toast } from "../../../store/use-toast-store";
import type {
  AdminPlanDetail,
  PlanAction,
  PlanContent,
  PlanPillar,
  PlanPriority,
  StageId,
} from "../../../types/tracking";
import { formatPeriod } from "../../checkin/components/checkin-page";
import { DiagnosticAnswers } from "../../diagnostic/components/diagnostic-answers";
import { useAdminPlan } from "../admin-api";
import { PlanPreviewOverlay } from "./plan-preview-overlay";
import { Badge, DueBadge, PlanBadge } from "../admin-shared";

interface PlanEditorPageProps {
  planId: string;
}

const EMPTY_PRIORITY: PlanPriority = { name: "", why: "", blocks: "", changes: "" };

function newAction(): PlanAction {
  return {
    id: "",
    title: "",
    why: "",
    steps: [],
    indicators: [],
    doneCriteria: "",
    content: "",
    resource: "",
    crm: "",
  };
}

/** Campo de lista: uma linha por item. */
function LinesField({
  id,
  label,
  hint,
  value,
  rows = 3,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  rows?: number;
  onChange: (value: string[]) => void;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Textarea
        id={id}
        rows={rows}
        value={value.join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n"))}
      />
    </Field>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-lg font-bold text-(--text-main)">{title}</h2>
      {description && <p className="mt-1 text-sm text-(--text-muted)">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </Card>
  );
}

/**
 * Revisão de um plano: à esquerda o que o aluno informou, à direita o
 * documento que ele vai receber. Só é liberado se cumprir as regras da
 * metodologia (uma prioridade principal, até 3 ações, critério de conclusão...).
 */
export function PlanEditorPage({ planId }: PlanEditorPageProps) {
  const query = useAdminPlan(planId);
  const queryClient = useQueryClient();
  const [content, setContent] = useState<PlanContent | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "approve" | "regenerate" | null>(null);
  // "student" = como o aluno vê (filtrado pelo plano dele); "full" = tudo, para o PDF.
  const [preview, setPreview] = useState<"student" | "full" | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [instructions, setInstructions] = useState("");
  const data = query.data;

  // Carrega o texto no editor quando o plano chega do servidor.
  useEffect(() => {
    if (data) {
      setContent(data.plan.content);
      setErrors(data.errors);
    }
  }, [data]);

  const update = (patch: (current: PlanContent) => PlanContent) =>
    setContent((current) => (current ? patch(current) : current));

  const persist = async () => {
    const response = await axios.put<{ plan: AdminPlanDetail["plan"]; errors: string[] }>(
      `/api/admin/plans/${planId}`,
      { content },
      authConfig(),
    );
    setContent(response.data.plan.content);
    setErrors(response.data.errors);
    return response.data.errors;
  };

  const handleError = (error: unknown, fallback: string) => {
    const serverErrors = axios.isAxiosError(error)
      ? (error.response?.data as { errors?: string[] } | undefined)?.errors
      : undefined;
    if (serverErrors?.length) setErrors(serverErrors);
    toast.error(getErrorMessage(error, fallback));
  };

  const handleSave = async () => {
    setBusy("save");
    try {
      const pending = await persist();
      toast.success(
        "Plano salvo.",
        pending.length > 0 ? { message: `Faltam ${pending.length} ponto(s) para liberar.` } : undefined,
      );
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    } catch (error) {
      handleError(error, "Não foi possível salvar o plano.");
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    setBusy("regenerate");
    try {
      await axios.post(`/api/admin/plans/${planId}/regenerate`, { instructions }, authConfig());
      toast.success("Novo rascunho pedido à IA.", { message: "Leva alguns minutos. Esta tela atualiza sozinha." });
      setRegenerating(false);
      setInstructions("");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (error) {
      handleError(error, "Não foi possível pedir o novo rascunho.");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    setBusy("approve");
    try {
      const pending = await persist();
      if (pending.length > 0) {
        toast.warning("O plano ainda não pode ser liberado.", {
          message: "Veja os pontos listados no fim da página.",
        });
        return;
      }
      await axios.post(`/api/admin/plans/${planId}/approve`, {}, authConfig());
      toast.success("Plano liberado para o aluno.");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      navigate("/adm/planos");
    } catch (error) {
      handleError(error, "Não foi possível liberar o plano.");
    } finally {
      setBusy(null);
    }
  };

  const setPillar = (pillarId: string, patch: Partial<PlanPillar>) =>
    update((current) => ({
      ...current,
      diagnosis: {
        ...current.diagnosis,
        pillars: current.diagnosis.pillars.map((pillar) =>
          pillar.id === pillarId ? { ...pillar, ...patch } : pillar,
        ),
      },
    }));

  const setAction = (index: number, patch: Partial<PlanAction>) =>
    update((current) => ({
      ...current,
      actions: current.actions.map((action, position) =>
        position === index ? { ...action, ...patch } : action,
      ),
    }));

  const toggleContent = (group: "ceo" | "team", item: string) =>
    update((current) => {
      const selected = current.development[group];
      return {
        ...current,
        development: {
          ...current.development,
          [group]: selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item],
        },
      };
    });

  const draftStatus = data?.plan.draftStatus || "none";
  // Enquanto a IA escreve, ninguém edita: o rascunho substituiria o texto.
  const draftBusy = draftStatus === "queued" || draftStatus === "generating";
  const isPremium = data?.member.plan === "premium";
  const isApproved = data?.plan.status === "approved";

  return (
    <Page
      title={data ? `Plano de ${data.member.name}` : "Plano"}
      subtitle={data?.member.email}
      actions={
        <div className="flex flex-wrap gap-2">
          {data && content && (
            <>
              <Button variant="secondary" onClick={() => setPreview("student")}>
                <Eye className="h-4 w-4" />
                Visualizar como aluno
              </Button>
              <Button variant="secondary" onClick={() => setPreview("full")}>
                <Download className="h-4 w-4" />
                Exportar PDF
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => navigate("/adm/planos")}>
            <ArrowLeft className="h-4 w-4" />
            Planos
          </Button>
        </div>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o plano."
      />

      {preview && data && content && (
        <PlanPreviewOverlay
          title={preview === "student" ? "Visualização do aluno" : "Documento completo (PDF)"}
          subtitle={data.member.name}
          pillars={data.pillars}
          stages={data.stages}
          plan={{
            ...data.plan,
            // Visão do aluno: o que não é Premium não recebe Plano de Ação nem
            // Rota de Desenvolvimento, igual ao que o servidor envia ao cliente.
            content:
              preview === "student" && data.member.plan !== "premium"
                ? { ...content, actions: [], development: { ceo: [], team: [] } }
                : content,
          }}
          onClose={() => setPreview(null)}
        />
      )}

      <Modal
        open={regenerating}
        title="Pedir rascunho à IA"
        onClose={() => setRegenerating(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegenerating(false)}>
              Cancelar
            </Button>
            <Button disabled={busy !== null} onClick={handleRegenerate}>
              {busy === "regenerate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar rascunho
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            O texto atual do plano será substituído pelo novo rascunho. Alterações que você fez e
            não quer perder precisam ser refeitas depois.
          </p>
          <Field
            label="Orientação para a IA (opcional)"
            htmlFor="plano-orientacao"
            hint="Ex.: priorize o processo comercial antes do financeiro; o cliente já usa um CRM."
          >
            <Textarea
              id="plano-orientacao"
              rows={4}
              maxLength={2000}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {data && draftBusy && (
        <Card className="flex items-start gap-4">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-(--primary)" />
          <div role="status">
            <h2 className="text-lg font-bold text-(--text-main)">A IA está escrevendo o rascunho</h2>
            <p className="mt-1 text-sm text-(--text-muted)">
              Ela lê a anamnese, aplica a metodologia e confere as regras antes de entregar. Leva
              alguns minutos. Esta tela atualiza sozinha quando o rascunho ficar pronto.
            </p>
          </div>
        </Card>
      )}

      {data && content && !draftBusy && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
          {/* O que o aluno informou */}
          <div className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
            <Card className="flex flex-wrap items-center gap-2">
              <PlanBadge plan={data.member.plan} />
              <Badge tone="neutral">Ciclo {data.plan.cycle}</Badge>
              {isApproved ? (
                <Badge tone="success">Liberado em {formatDate(data.plan.approvedAt)}</Badge>
              ) : (
                <DueBadge dueAt={data.plan.reviewDueAt} />
              )}
              {!isPremium && (
                <p className="mt-2 w-full text-xs font-medium text-(--text-muted)">
                  Cliente Essencial: recebe Diagnóstico 360°, Sua Direção e Próximo Passo. Plano de
                  Ação e Rota de Desenvolvimento só aparecem para ele se virar Premium.
                </p>
              )}
            </Card>

            {data.previous && (
              <Card>
                <h2 className="text-base font-bold text-(--text-main)">
                  O que foi feito no ciclo {data.previous.plan.cycle}
                </h2>
                <ul className="mt-3 space-y-3">
                  {data.previous.plan.content.actions.map((action) => {
                    const progress = data.previous?.progress[action.id];
                    return (
                      <li key={action.id} className="flex items-start gap-2 text-sm">
                        {progress?.done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-text)" aria-label="Concluída" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-(--text-soft)" aria-label="Não concluída" />
                        )}
                        <span>
                          <span className="block font-bold text-(--text-main)">{action.title}</span>
                          <span className="block text-xs text-(--text-muted)">
                            {progress?.done
                              ? `Concluída em ${formatDate(progress.completedAt)}`
                              : "Não concluída"}
                            {progress?.responsible && ` · Responsável: ${progress.responsible}`}
                            {progress?.dueDate && ` · Prazo: ${formatDate(progress.dueDate)}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {data.checkins.length > 0 && (
              <Card>
                <h2 className="text-base font-bold text-(--text-main)">Check-ins recentes</h2>
                <ul className="mt-3 space-y-3">
                  {data.checkins.map((checkin) => (
                    <li key={checkin.id} className="text-sm">
                      <span className="block font-bold capitalize text-(--text-main)">
                        {formatPeriod(checkin.period)}: {checkin.progressLabel.toLowerCase()}
                      </span>
                      <span className="block text-xs text-(--text-muted)">
                        {[checkin.reasonLabel, checkin.evolution].filter(Boolean).join(" · ") || "Sem observações"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <h2 className="text-base font-bold text-(--text-main)">Leitura da Matriz</h2>
              <p className="mt-1 text-xs text-(--text-muted)">
                Calculada pelas respostas. É o ponto de partida: o estágio que vale é o que você
                definir no documento.
              </p>
              <ul className="mt-4 space-y-3">
                {data.maturity.pillars.map((pillar) => {
                  const name = data.pillars.find((item) => item.id === pillar.id)?.name || pillar.id;
                  const stage = data.stages.find((item) => item.id === pillar.stage)?.name;
                  return (
                    <li key={pillar.id} className="text-sm">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-(--text-main)">{name}</span>
                        <Badge tone="neutral">
                          {stage || "Sem leitura"}
                          {!pillar.provisional && pillar.score !== null &&
                            ` · ${String(pillar.score).replace(".", ",")}`}
                        </Badge>
                      </span>
                      {pillar.notes.map((note) => (
                        <span key={note} className="mt-1 block text-xs text-(--text-muted)">
                          {note}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
              {data.maturity.signals.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                    Sinais
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-(--text-main)">
                    {data.maturity.signals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </>
              )}
              {data.maturity.execution.answer && (
                <p className="mt-4 rounded-xl bg-(--bg-surface-muted) p-3 text-xs text-(--text-main)">
                  <strong>Capacidade de execução:</strong> {data.maturity.execution.answer}. Sugestão:
                  até {data.maturity.execution.maxActions}{" "}
                  {data.maturity.execution.maxActions === 1 ? "ação ativa" : "ações ativas"} neste plano.
                </p>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-bold text-(--text-main)">Respostas da anamnese</h2>
              <DiagnosticAnswers questions={data.questions} answers={data.answers} />
            </Card>
          </div>

          {/* O documento que o aluno vai receber */}
          <div className="space-y-5">
            {!isApproved && (draftStatus !== "none" || data.agentConfigured) && (
              <Card className={draftStatus === "failed" ? "border-rose-300" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-base font-bold text-(--text-main)">
                      <Sparkles className="h-4 w-4 text-(--primary-text)" />
                      {draftStatus === "ready" && "Rascunho escrito pela IA"}
                      {draftStatus === "failed" && "A IA não conseguiu escrever o rascunho"}
                      {draftStatus === "none" && "Rascunho pela IA"}
                    </h2>
                    <p className="mt-1 text-sm text-(--text-muted)">
                      {draftStatus === "ready" &&
                        "Revise tudo antes de liberar: o texto abaixo é uma proposta, e a decisão é sua."}
                      {draftStatus === "failed" &&
                        (data.plan.draftError || "Tente de novo ou escreva o plano no editor.")}
                      {draftStatus === "none" && "Este plano ainda não tem rascunho da IA."}
                    </p>
                  </div>
                  {data.agentConfigured && (
                    <Button variant="soft" onClick={() => setRegenerating(true)}>
                      <Sparkles className="h-4 w-4" />
                      {draftStatus === "ready" ? "Gerar de novo" : "Pedir rascunho à IA"}
                    </Button>
                  )}
                </div>

                {draftStatus === "ready" && data.agentNotes && (
                  <div className="mt-4 space-y-3 border-t border-(--border-subtle) pt-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                        Notas da IA para a revisão
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-main)">
                        {data.agentNotes.reviewerNotes}
                      </p>
                    </div>
                    <p className="text-sm text-(--text-main)">
                      <strong>Prioridade declarada pelo cliente (pergunta 29):</strong>{" "}
                      {PRIORITY_RELATION[data.agentNotes.declaredPriorityRelation] ||
                        data.agentNotes.declaredPriorityRelation}
                    </p>
                    {data.agentNotes.remainingErrors.length > 0 && (
                      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                        A IA tentou corrigir, mas o rascunho ainda descumpre regras da metodologia.
                        Elas estão listadas no fim da página.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )}

            <SectionCard title="Identificação">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["company", "Empresa"],
                    ["owner", "Empresário"],
                    ["segment", "Segmento"],
                    ["city", "Cidade/UF"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`plano-id-${key}`}>
                    {key === "city" ? (
                      <CityUfField
                        id={`plano-id-${key}`}
                        value={content.identification.city}
                        onChange={(city) =>
                          update((current) => ({
                            ...current,
                            identification: { ...current.identification, city },
                          }))
                        }
                      />
                    ) : (
                      <Input
                        id={`plano-id-${key}`}
                        value={content.identification[key]}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            identification: { ...current.identification, [key]: event.target.value },
                          }))
                        }
                      />
                    )}
                  </Field>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Seu Diagnóstico 360°"
              description="Conecte as respostas em vez de repetir a anamnese. Específico, sóbrio, sem travessões."
            >
              <Field
                label="Leitura do momento atual"
                htmlFor="plano-leitura"
                hint="De 120 a 180 palavras, no máximo dois parágrafos."
              >
                <Textarea
                  id="plano-leitura"
                  rows={7}
                  value={content.diagnosis.reading}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      diagnosis: { ...current.diagnosis, reading: event.target.value },
                    }))
                  }
                />
              </Field>

              {content.diagnosis.pillars.map((pillar) => {
                const name = data.pillars.find((item) => item.id === pillar.id)?.name || pillar.id;
                const fieldId = `plano-pilar-${pillar.id}`;

                return (
                  <fieldset key={pillar.id} className="rounded-xl border border-(--border-subtle) p-4">
                    <legend className="px-1 text-sm font-bold text-(--text-main)">{name}</legend>
                    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                      <Field label="Estágio de maturidade" htmlFor={`${fieldId}-estagio`}>
                        <Select
                          id={`${fieldId}-estagio`}
                          value={pillar.stage}
                          onChange={(event) => setPillar(pillar.id, { stage: event.target.value as StageId | "" })}
                        >
                          <option value="">Selecione</option>
                          {data.stages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name} ({stage.range})
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Nota (opcional)" htmlFor={`${fieldId}-nota`}>
                        <Input
                          id={`${fieldId}-nota`}
                          inputMode="decimal"
                          placeholder="0 a 10"
                          value={pillar.score ?? ""}
                          onChange={(event) => setPillar(pillar.id, { score: event.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      {(
                        [
                          ["exists", "O que já existe"],
                          ["attention", "Ponto de atenção"],
                          ["requires", "O que isso exige agora"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label} htmlFor={`${fieldId}-${key}`}>
                          <Textarea
                            id={`${fieldId}-${key}`}
                            rows={3}
                            value={pillar[key]}
                            onChange={(event) => setPillar(pillar.id, { [key]: event.target.value })}
                          />
                        </Field>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              <Field
                label="Síntese diagnóstica"
                htmlFor="plano-sintese"
                hint="Por que poucas frentes serão priorizadas agora."
              >
                <Textarea
                  id="plano-sintese"
                  rows={3}
                  value={content.diagnosis.synthesis}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      diagnosis: { ...current.diagnosis, synthesis: event.target.value },
                    }))
                  }
                />
              </Field>
            </SectionCard>

            <SectionCard title="Sua Direção" description="Uma prioridade principal. A complementar só entra se for realmente necessária.">
              <PriorityFields
                idPrefix="plano-principal"
                legend="Prioridade principal"
                priority={content.direction.main}
                onChange={(main) => update((current) => ({ ...current, direction: { ...current.direction, main } }))}
              />

              {content.direction.complementary ? (
                <>
                  <PriorityFields
                    idPrefix="plano-complementar"
                    legend="Prioridade complementar"
                    priority={content.direction.complementary}
                    onChange={(complementary) =>
                      update((current) => ({ ...current, direction: { ...current.direction, complementary } }))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update((current) => ({ ...current, direction: { ...current.direction, complementary: null } }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover prioridade complementar
                  </Button>
                </>
              ) : (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      direction: { ...current.direction, complementary: { ...EMPTY_PRIORITY } },
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  Adicionar prioridade complementar
                </Button>
              )}

              <div className="grid gap-4 lg:grid-cols-3">
                {(
                  [
                    ["now", "Rota: agora"],
                    ["next", "Rota: depois"],
                    ["later", "Rota: na sequência"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`plano-rota-${key}`}>
                    <Textarea
                      id={`plano-rota-${key}`}
                      rows={3}
                      value={content.direction.route[key]}
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          direction: {
                            ...current.direction,
                            route: { ...current.direction.route, [key]: event.target.value },
                          },
                        }))
                      }
                    />
                  </Field>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Seu Plano de Ação"
              description="Adicione quantas ações quiser. Cada uma precisa ser executável sem explicação extra."
            >
              {content.actions.map((action, index) => {
                const fieldId = `plano-acao-${index}`;
                return (
                  <fieldset key={index} className="rounded-xl border border-(--border-subtle) p-4">
                    <legend className="px-1 text-sm font-bold text-(--text-main)">Ação {index + 1}</legend>
                    <div className="space-y-4">
                      <Field label="Título" htmlFor={`${fieldId}-titulo`} hint="Comece com um verbo concreto: levantar, definir, registrar...">
                        <Input
                          id={`${fieldId}-titulo`}
                          value={action.title}
                          maxLength={255}
                          onChange={(event) => setAction(index, { title: event.target.value })}
                        />
                      </Field>
                      <Field label="Por que fazer" htmlFor={`${fieldId}-porque`}>
                        <Textarea
                          id={`${fieldId}-porque`}
                          rows={2}
                          value={action.why}
                          onChange={(event) => setAction(index, { why: event.target.value })}
                        />
                      </Field>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <LinesField
                          id={`${fieldId}-passos`}
                          label="Como fazer"
                          hint="Um passo por linha."
                          rows={4}
                          value={action.steps}
                          onChange={(steps) => setAction(index, { steps })}
                        />
                        <LinesField
                          id={`${fieldId}-indicadores`}
                          label="Indicadores (opcional)"
                          hint="De 1 a 3, um por linha."
                          rows={4}
                          value={action.indicators}
                          onChange={(indicators) => setAction(index, { indicators })}
                        />
                      </div>
                      <Field
                        label="Critério de conclusão"
                        htmlFor={`${fieldId}-criterio`}
                        hint="Uma evidência que o próprio empresário consegue conferir."
                      >
                        <Textarea
                          id={`${fieldId}-criterio`}
                          rows={2}
                          value={action.doneCriteria}
                          onChange={(event) => setAction(index, { doneCriteria: event.target.value })}
                        />
                      </Field>
                      <div className="grid gap-4 lg:grid-cols-3">
                        {(
                          [
                            ["content", "Conteúdo recomendado (opcional)"],
                            ["resource", "Recurso de apoio (opcional)"],
                            ["crm", "CRM, sempre opcional"],
                          ] as const
                        ).map(([key, label]) => (
                          <Field key={key} label={label} htmlFor={`${fieldId}-${key}`}>
                            <Textarea
                              id={`${fieldId}-${key}`}
                              rows={2}
                              value={action[key]}
                              onChange={(event) => setAction(index, { [key]: event.target.value })}
                            />
                          </Field>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            actions: current.actions.filter((_, position) => position !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover ação {index + 1}
                      </Button>
                    </div>
                  </fieldset>
                );
              })}

              <Button
                variant="soft"
                onClick={() => update((current) => ({ ...current, actions: [...current.actions, newAction()] }))}
              >
                <Plus className="h-4 w-4" />
                Adicionar ação
              </Button>
            </SectionCard>

            <SectionCard
              title="Sua Rota de Desenvolvimento"
              description="Só o conteúdo ligado à prioridade atual. Não é uma grade de curso."
            >
              {(
                [
                  ["ceo", "Para o empresário (Formação Executiva)", data.catalog.ceo],
                  ["team", "Para o time (Academy)", data.catalog.academy],
                ] as const
              ).map(([group, legend, items]) => (
                <fieldset key={group}>
                  <legend className="text-[13px] font-bold text-(--text-main)">{legend}</legend>
                  <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {items.map((item) => (
                      <label key={item} className="flex cursor-pointer items-start gap-2 text-sm text-(--text-main)">
                        <input
                          type="checkbox"
                          checked={content.development[group].includes(item)}
                          onChange={() => toggleContent(group, item)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-(--primary)"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </SectionCard>

            <SectionCard
              title="Seu Próximo Passo"
              description="Uma única ação inicial: a menor ação relevante, não a menor possível."
            >
              <Field label="O que fazer primeiro" htmlFor="plano-proximo-acao">
                <Textarea
                  id="plano-proximo-acao"
                  rows={2}
                  value={content.nextStep.action}
                  onChange={(event) =>
                    update((current) => ({ ...current, nextStep: { ...current.nextStep, action: event.target.value } }))
                  }
                />
              </Field>
              <Field label="Por que começar por aqui" htmlFor="plano-proximo-porque">
                <Textarea
                  id="plano-proximo-porque"
                  rows={2}
                  value={content.nextStep.why}
                  onChange={(event) =>
                    update((current) => ({ ...current, nextStep: { ...current.nextStep, why: event.target.value } }))
                  }
                />
              </Field>
              <LinesField
                id="plano-proximo-passos"
                label="Passos (opcional)"
                hint="Até 3, um por linha."
                value={content.nextStep.steps}
                onChange={(steps) => update((current) => ({ ...current, nextStep: { ...current.nextStep, steps } }))}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Critério de conclusão" htmlFor="plano-proximo-criterio">
                  <Textarea
                    id="plano-proximo-criterio"
                    rows={2}
                    value={content.nextStep.doneCriteria}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        nextStep: { ...current.nextStep, doneCriteria: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="O que vem depois (opcional)" htmlFor="plano-proximo-depois">
                  <Textarea
                    id="plano-proximo-depois"
                    rows={2}
                    value={content.nextStep.after}
                    onChange={(event) =>
                      update((current) => ({ ...current, nextStep: { ...current.nextStep, after: event.target.value } }))
                    }
                  />
                </Field>
              </div>
            </SectionCard>

            <Card className={errors.length > 0 ? "border-amber-400" : "border-(--primary)"}>
              {errors.length > 0 ? (
                <div role="status">
                  <h2 className="text-base font-bold text-(--text-main)">
                    Falta para liberar ({errors.length})
                  </h2>
                  <p className="mt-1 text-xs text-(--text-muted)">Atualizado no último salvamento.</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-(--text-main)">
                    {errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm font-bold text-(--text-main)">
                  O plano cumpre as regras da metodologia e pode ser liberado.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy !== null} onClick={handleSave}>
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isApproved ? "Salvar alterações" : "Salvar rascunho"}
                </Button>
                {!isApproved && (
                  <Button disabled={busy !== null} onClick={handleApprove}>
                    {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Aprovar e liberar para o aluno
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

// Relação entre o que o cliente pediu na pergunta 29 e a prioridade do diagnóstico.
const PRIORITY_RELATION: Record<string, string> = {
  alinhada: "alinhada com a prioridade do diagnóstico.",
  parcialmente_alinhada: "parcialmente alinhada: o tema está certo, mas existe uma etapa anterior.",
  valida_porem_posterior: "válida, porém posterior: faz sentido, mas não entra agora.",
  incompativel_com_a_prioridade_atual: "incompatível com a prioridade atual: conflita com uma dependência estrutural.",
};

function PriorityFields({
  idPrefix,
  legend,
  priority,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  priority: PlanPriority;
  onChange: (priority: PlanPriority) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-(--border-subtle) p-4">
      <legend className="px-1 text-sm font-bold text-(--text-main)">{legend}</legend>
      <div className="space-y-4">
        <Field label="Nome da prioridade" htmlFor={`${idPrefix}-nome`}>
          <Input
            id={`${idPrefix}-nome`}
            value={priority.name}
            maxLength={200}
            onChange={(event) => onChange({ ...priority, name: event.target.value })}
          />
        </Field>
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              ["why", "Por que vem primeiro"],
              ["blocks", "O que está bloqueando"],
              ["changes", "O que muda quando for resolvida"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`${idPrefix}-${key}`}>
              <Textarea
                id={`${idPrefix}-${key}`}
                rows={3}
                value={priority[key]}
                onChange={(event) => onChange({ ...priority, [key]: event.target.value })}
              />
            </Field>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
