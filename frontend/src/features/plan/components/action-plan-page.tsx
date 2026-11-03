import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Card, EmptyState, Page, ProgressBar, QueryState } from "../../../components/ui/page";
import { isOverdue } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { toast } from "../../../store/use-toast-store";
import type { ActionProgress, MemberPlanResponse, PlanAction } from "../../../types/tracking";
import { planQueryKey, useMarkPlanSeenMutation, usePlanQuery } from "../hooks/use-plan-query";
import { ActionDetails } from "./plan-document";
import { ReviewNotice } from "./review-notice";

type ProgressPatch = { responsible?: string; dueDate?: string; done?: boolean };

/**
 * Plano de Ação em execução: o empresário define responsável e prazo de cada
 * ação e marca o que concluiu. A Gestão 360 não acompanha tarefa por tarefa.
 */
export function ActionPlanPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const query = usePlanQuery();
  const data = query.data;

  // Ao abrir, marca o plano liberado como visto: o aviso "Novo" some da barra e da Início.
  const markSeen = useMarkPlanSeenMutation();
  const seenRef = useRef(false);
  useEffect(() => {
    if (data?.planUnseen && !seenRef.current) {
      seenRef.current = true;
      markSeen.mutate();
    }
  }, [data?.planUnseen, markSeen]);

  const update = useMutation({
    mutationFn: async ({ actionId, patch }: { actionId: string; patch: ProgressPatch }) =>
      (
        await axios.patch<{ progress: MemberPlanResponse["progress"] }>(
          `/api/plan/actions/${actionId}`,
          patch,
          authConfig(),
        )
      ).data.progress,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planQueryKey(userId) }),
    onError: (error) =>
      toast.error("Não foi possível atualizar a ação.", {
        message: getErrorMessage(error, "Tente novamente."),
      }),
  });

  const requestNext = useMutation({
    mutationFn: async () => (await axios.post("/api/plan/next-cycle", {}, authConfig())).data,
    onSuccess: () => {
      toast.success("Pedido recebido.", {
        message: "Em até 72 horas úteis nosso time devolve o seu novo plano.",
      });
      return queryClient.invalidateQueries({ queryKey: planQueryKey(userId) });
    },
    onError: (error) =>
      toast.error("Não foi possível pedir o novo plano.", {
        message: getErrorMessage(error, "Tente novamente."),
      }),
  });

  const actions = data?.plan?.content.actions || [];
  const done = actions.filter((action) => data?.progress[action.id]?.done).length;

  return (
    <Page
      title="Plano de Ação"
      subtitle="Poucas ações por vez. Defina quem faz e até quando, execute e marque o que concluiu."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o seu plano."
      />

      {data && (
        <div className="space-y-5">
          {data.review && <ReviewNotice review={data.review} firstCycle={!data.plan} />}

          {!data.plan && !data.review && (
            <EmptyState>Seu plano de ação aparece aqui depois que você enviar a anamnese.</EmptyState>
          )}

          {actions.length > 0 && (
            <>
              <Card>
                <p className="mb-2 text-sm font-bold text-(--text-main)">
                  Seu progresso no ciclo {data.plan?.cycle}
                </p>
                <ProgressBar done={done} total={actions.length} />
              </Card>

              {actions.map((action, index) => (
                <ActionCard
                  key={action.id}
                  index={index}
                  action={action}
                  progress={data.progress[action.id]}
                  saving={update.isPending && update.variables?.actionId === action.id}
                  onSave={(patch) => update.mutate({ actionId: action.id, patch })}
                />
              ))}
            </>
          )}

          {data.canRequestNext && (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-(--primary)">
              <div>
                <h2 className="text-lg font-bold text-(--text-main)">Você concluiu este plano</h2>
                <p className="mt-1 max-w-xl text-sm text-(--text-muted)">
                  Peça o próximo. Nosso time olha o que você executou, a situação atual da empresa e
                  monta as próximas ações da sua rota.
                </p>
              </div>
              <Button onClick={() => requestNext.mutate()} disabled={requestNext.isPending}>
                {requestNext.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Pedir novo plano
              </Button>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

function ActionCard({
  index,
  action,
  progress,
  saving,
  onSave,
}: {
  index: number;
  action: PlanAction;
  progress: ActionProgress | undefined;
  saving: boolean;
  onSave: (patch: ProgressPatch) => void;
}) {
  const [responsible, setResponsible] = useState(progress?.responsible || "");
  const [dueDate, setDueDate] = useState(progress?.dueDate || "");
  const isDone = Boolean(progress?.done);
  const changed = responsible !== (progress?.responsible || "") || dueDate !== (progress?.dueDate || "");
  const atrasado = !isDone && isOverdue(progress?.dueDate);
  const fieldId = `acao-${action.id}`;

  return (
    <Card>
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `Desmarcar: ${action.title}` : `Concluir: ${action.title}`}
          disabled={saving}
          onClick={() => onSave({ done: !isDone })}
          className={cn(
            "mt-0.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border-2 transition-colors disabled:opacity-60",
            isDone
              ? "border-(--primary) bg-(--primary) text-white"
              : "border-(--border-strong) text-transparent hover:border-(--primary)",
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
            Ação {index + 1}
            {isDone && " · concluída"}
            {atrasado && <span className="text-rose-600"> · prazo vencido</span>}
          </p>
          <h2 className="mt-1 text-lg font-bold text-(--text-main)">{action.title}</h2>
        </div>
      </div>

      <div className="mt-5">
        <ActionDetails action={action} />
      </div>

      <form
        className="mt-6 grid gap-3 border-t border-(--border-subtle) pt-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ responsible, dueDate });
        }}
      >
        <Field label="Responsável" htmlFor={`${fieldId}-responsavel`}>
          <Input
            id={`${fieldId}-responsavel`}
            placeholder="Quem vai executar"
            value={responsible}
            maxLength={255}
            onChange={(event) => setResponsible(event.target.value)}
          />
        </Field>
        <Field label="Prazo que você assume" htmlFor={`${fieldId}-prazo`}>
          <Input
            id={`${fieldId}-prazo`}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={!changed || saving}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}
