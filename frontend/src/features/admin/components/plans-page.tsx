import { EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import type { AdminPlanListItem } from "../../../types/tracking";
import { useAdminPlans } from "../admin-api";
import { Badge, DueBadge, PlanBadge } from "../admin-shared";

function PlanTable({ plans }: { plans: AdminPlanListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--border-subtle) bg-(--bg-surface)">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-(--border-subtle) text-xs uppercase tracking-wider text-(--text-muted)">
            <th scope="col" className="px-5 py-3 font-bold">Aluno</th>
            <th scope="col" className="px-5 py-3 font-bold">Plano contratado</th>
            <th scope="col" className="px-5 py-3 font-bold">Ciclo</th>
            <th scope="col" className="px-5 py-3 font-bold">Situação</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr
              key={plan.id}
              className="border-b border-(--border-subtle) transition-colors last:border-0 hover:bg-(--bg-surface-muted)"
            >
              <th scope="row" className="px-5 py-4 font-normal">
                <button
                  type="button"
                  onClick={() => navigate(`/adm/planos/${plan.id}`)}
                  className="cursor-pointer text-left"
                >
                  <span className="block font-bold text-(--text-main) underline-offset-2 hover:underline">
                    {plan.member.name}
                  </span>
                  <span className="block text-xs text-(--text-muted)">{plan.member.email}</span>
                </button>
              </th>
              <td className="px-5 py-4">
                <PlanBadge plan={plan.member.plan} />
              </td>
              <td className="px-5 py-4 font-bold tabular-nums text-(--text-main)">{plan.cycle}</td>
              <td className="px-5 py-4">
                {plan.status === "pending" ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <DueBadge dueAt={plan.dueAt} />
                    {(plan.draftStatus === "queued" || plan.draftStatus === "generating") && (
                      <Badge tone="neutral">IA escrevendo</Badge>
                    )}
                    {plan.draftStatus === "ready" && <Badge tone="success">Rascunho da IA pronto</Badge>}
                    {plan.draftStatus === "failed" && <Badge tone="danger">IA falhou</Badge>}
                  </span>
                ) : (
                  <Badge tone="success">Liberado em {formatDate(plan.approvedAt)}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Fila de revisão: os planos que esperam a equipe e os já liberados. */
export function PlansPage() {
  const query = useAdminPlans();
  const plans = query.data || [];
  const pending = plans.filter((plan) => plan.status === "pending");
  const approved = plans.filter((plan) => plan.status === "approved");

  return (
    <Page
      title="Planos"
      subtitle="Cada anamnese enviada vira um plano nesta fila. Revise, ajuste e libere em até 72 horas úteis. O aluno só vê o que foi aprovado."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os planos."
      />

      {query.data && (
        <div className="space-y-10">
          <section aria-labelledby="planos-para-revisar">
            <h2 id="planos-para-revisar" className="mb-4 text-lg font-bold text-(--text-main)">
              Para revisar ({pending.length})
            </h2>
            {pending.length > 0 ? (
              <PlanTable plans={pending} />
            ) : (
              <EmptyState>Nenhum plano esperando revisão.</EmptyState>
            )}
          </section>

          {approved.length > 0 && (
            <section aria-labelledby="planos-liberados">
              <h2 id="planos-liberados" className="mb-4 text-lg font-bold text-(--text-main)">
                Liberados ({approved.length})
              </h2>
              <PlanTable plans={approved} />
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
