import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { CalendarDays, Check } from "lucide-react";
import { Card, EmptyState, Page, ProgressBar, QueryState } from "../../../components/ui/page";
import { formatDate, isOverdue } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { toast } from "../../../store/use-toast-store";
import type { Activity } from "../../../types/tracking";

/**
 * Atividades práticas semanais (Premium). São publicadas pela equipe para
 * todos os clientes do plano, não são individuais; cada pessoa marca as que já fez.
 */
export function ActivitiesPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const queryKey = ["activities", userId];

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await axios.get<{ activities: Activity[] }>("/api/activities", authConfig())).data.activities,
  });

  const toggle = useMutation({
    mutationFn: async (activity: Activity) =>
      (
        await axios.patch<{ id: string; done: boolean }>(
          `/api/activities/${activity.id}`,
          { done: !activity.done },
          authConfig(),
        )
      ).data,
    onSuccess: (result) => {
      queryClient.setQueryData<Activity[]>(queryKey, (current) =>
        current?.map((activity) =>
          activity.id === result.id ? { ...activity, done: result.done } : activity,
        ),
      );
    },
    onError: (error) =>
      toast.error("Não foi possível atualizar a atividade.", {
        message: getErrorMessage(error, "Tente novamente."),
      }),
  });

  const activities = query.data || [];
  const done = activities.filter((activity) => activity.done).length;

  return (
    <Page
      title="Atividades Práticas"
      subtitle="Aplicações semanais para sair da teoria e colocar a gestão em prática na sua empresa."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as atividades."
      />

      {query.data && activities.length === 0 && (
        <EmptyState>As atividades da semana aparecem aqui assim que forem publicadas.</EmptyState>
      )}

      {activities.length > 0 && (
        <div className="space-y-4">
          <Card>
            <p className="mb-2 text-sm font-bold text-(--text-main)">Atividades feitas</p>
            <ProgressBar done={done} total={activities.length} />
          </Card>

          <ul className="space-y-3">
            {activities.map((activity) => {
              const atrasado = !activity.done && isOverdue(activity.dueDate);

              return (
                <li key={activity.id}>
                  <Card className="flex items-start gap-4">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={activity.done}
                      aria-label={
                        activity.done ? `Desmarcar: ${activity.title}` : `Marcar como feita: ${activity.title}`
                      }
                      disabled={toggle.isPending && toggle.variables?.id === activity.id}
                      onClick={() => toggle.mutate(activity)}
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg border-2 transition-colors disabled:opacity-60",
                        activity.done
                          ? "border-(--primary) bg-(--primary) text-white"
                          : "border-(--border-strong) text-transparent hover:border-(--primary)",
                      )}
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <h2
                        className={cn(
                          "text-base font-bold text-(--text-main)",
                          activity.done && "text-(--text-muted) line-through",
                        )}
                      >
                        {activity.title}
                      </h2>
                      {activity.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-muted)">
                          {activity.description}
                        </p>
                      )}
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-(--text-muted)">
                        <span>Publicada em {formatDate(activity.publishedAt)}</span>
                        {activity.dueDate && (
                          <span className={cn("inline-flex items-center gap-1.5", atrasado && "text-rose-600")}>
                            <CalendarDays className="h-3.5 w-3.5" />
                            Até {formatDate(activity.dueDate)}
                            {atrasado && " (atrasada)"}
                          </span>
                        )}
                      </p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Page>
  );
}
