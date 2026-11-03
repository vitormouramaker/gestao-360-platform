import { ChevronRight } from "lucide-react";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { EventCard } from "../../calendar/components/event-card";
import { useAdminAccess } from "../admin-access";
import { useAdminOverview } from "../admin-api";
import { DueBadge, PlanBadge } from "../admin-shared";

const rowClass =
  "flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-4 text-left transition-colors hover:border-(--primary) disabled:cursor-default disabled:hover:border-(--border-subtle)";

/** Entrada do painel: números do programa e o que está esperando a equipe. */
export function OverviewPage() {
  const query = useAdminOverview();
  const data = query.data;
  // Atalhos para áreas que a pessoa não tem liberadas ficam sem link (ou somem).
  const { can } = useAdminAccess();
  const canPlans = can("/adm/planos");
  const canStudents = can("/adm/alunos");

  return (
    <Page title="Visão geral" subtitle="O andamento dos alunos do Gestão 360°.">
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />

      {data && (
        <div className="space-y-10">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
            {[
              { label: "Alunos", value: data.totals.students },
              { label: "Plano Essencial", value: data.totals.essencial },
              { label: "Plano Premium", value: data.totals.premium },
              { label: "Planos para revisar", value: data.totals.plansPending },
              { label: "Sem anamnese enviada", value: data.totals.anamneseMissing },
              { label: "Check-ins neste mês", value: data.totals.checkinsThisMonth },
            ].map((item) => (
              <Card key={item.label}>
                <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                  {item.label}
                </dt>
                <dd className="g360-brand-font mt-2 text-3xl font-extrabold text-(--text-main)">
                  {item.value}
                </dd>
              </Card>
            ))}
          </dl>

          {data.agentConfigured ? (
            <p className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3 text-sm font-medium text-(--text-main)">
              A IA escreve o rascunho de cada plano em alguns minutos depois que a anamnese chega.
              Nada vai para o cliente sem a sua aprovação.
            </p>
          ) : (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              A IA que gera o rascunho do diagnóstico ainda não está ligada. Por enquanto os planos
              chegam à fila com a identificação e o estágio de cada pilar já calculados pela Matriz,
              e o texto é escrito pela equipe no editor.
            </p>
          )}

          <div className="grid gap-10 xl:grid-cols-2">
            <div className="space-y-10">
              <section aria-labelledby="fila-planos">
                <h2 id="fila-planos" className="mb-1 text-lg font-bold text-(--text-main)">
                  Planos para revisar
                </h2>
                <p className="mb-4 text-sm text-(--text-muted)">
                  O aluno só vê o diagnóstico depois da aprovação. Prazo: 72 horas úteis.
                </p>
                {data.pendingPlans.length > 0 ? (
                  <ul className="space-y-3">
                    {data.pendingPlans.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          disabled={!canPlans}
                          onClick={() => navigate(`/adm/planos/${member.pendingPlan?.id}`)}
                          className={rowClass}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-bold text-(--text-main)">
                                {member.name}
                              </span>
                              <PlanBadge plan={member.plan} />
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                              Ciclo {member.pendingPlan?.cycle} · pedido em{" "}
                              {formatDate(member.pendingPlan?.requestedAt)}
                              {member.pendingPlan && <DueBadge dueAt={member.pendingPlan.dueAt} />}
                            </span>
                          </span>
                          {canPlans && <ChevronRight className="h-4 w-4 shrink-0 text-(--text-muted)" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>Nenhum plano esperando revisão.</EmptyState>
                )}
              </section>

              <section aria-labelledby="suporte-aguardando">
                <h2 id="suporte-aguardando" className="mb-1 text-lg font-bold text-(--text-main)">
                  Orientados a falar com o time
                </h2>
                <p className="mb-4 text-sm text-(--text-muted)">
                  Alunos a quem a IA de suporte ofereceu falar com o time (WhatsApp ou chat) nos
                  últimos 7 dias, com a pergunta que ela não resolveu.
                </p>
                {data.externalFailed > 0 && (
                  <p className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-rose-800">
                    {data.externalFailed} acesso(s) em outras plataformas (Academy, Formação Executiva ou
                    CRM) falharam. Abra o aluno e use Tentar de novo.
                  </p>
                )}
                {data.supportQueue > 0 && can("/adm/atendimento") && (
                  <button
                    type="button"
                    onClick={() => navigate("/adm/atendimento")}
                    className="mb-4 w-full cursor-pointer rounded-xl border border-(--primary) bg-(--primary)/10 p-3 text-left text-sm font-bold text-(--text-main)"
                  >
                    {data.supportQueue} aluno(s) na fila de atendimento pelo chat. Abrir a fila.
                  </button>
                )}
                {data.supportFlagged.messages > 0 && can("/adm/uso-do-suporte") && (
                  <button
                    type="button"
                    onClick={() => navigate("/adm/uso-do-suporte")}
                    className="mb-4 w-full cursor-pointer rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm font-medium text-amber-900"
                  >
                    Uso indevido do suporte nos últimos 7 dias: {data.supportFlagged.messages} mensagem(ns)
                    de {data.supportFlagged.members} aluno(s). Ver ocorrências.
                  </button>
                )}
                {data.supportWaiting.length > 0 ? (
                  <ul className="space-y-3">
                    {data.supportWaiting.map((item) => (
                      <li key={item.memberId}>
                        <button
                          type="button"
                          disabled={!canStudents}
                          onClick={() => navigate(`/adm/alunos/${encodeURIComponent(item.memberId)}`)}
                          className={rowClass}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-(--text-main)">
                              {item.name}
                            </span>
                            <span className="mt-1 block truncate text-xs text-(--text-muted)">
                              {item.content}
                            </span>
                          </span>
                          {canStudents && <ChevronRight className="h-4 w-4 shrink-0 text-(--text-muted)" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>Nenhuma conversa esperando resposta.</EmptyState>
                )}
              </section>
            </div>

            <section aria-labelledby="proximos-eventos">
              <h2 id="proximos-eventos" className="mb-1 text-lg font-bold text-(--text-main)">
                Próximos eventos
              </h2>
              <p className="mb-4 text-sm text-(--text-muted)">O que está marcado no calendário.</p>
              {data.upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {data.upcomingEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <EmptyState>Nenhum evento marcado. Cadastre as datas em Calendário.</EmptyState>
              )}
            </section>
          </div>
        </div>
      )}
    </Page>
  );
}
