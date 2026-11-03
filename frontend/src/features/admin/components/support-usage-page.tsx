import { useState } from "react";
import { X } from "lucide-react";
import { Field, Select } from "../../../components/ui/field";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDateTime } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { useAdminAction, useAdminSupportFlags } from "../admin-api";
import { Badge, PlanBadge } from "../admin-shared";

const PERIODS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
];

/**
 * Uso indevido do suporte: mensagens que a IA marcou como fora do propósito
 * do chat. A marca é uma triagem; quem decide é a pessoa que lê a mensagem.
 */
export function SupportUsagePage() {
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState("");
  const [memberId, setMemberId] = useState("");
  const query = useAdminSupportFlags({ days, category, memberId });
  const action = useAdminAction();

  const data = query.data;
  const categories = data?.categories || [];
  const labelOf = (id: string) => categories.find((item) => item.id === id)?.label || id;
  const isSevere = (id: string) => categories.find((item) => item.id === id)?.severe || false;
  const selected = data?.members.find((member) => member.memberId === memberId);

  return (
    <Page
      title="Uso do suporte"
      subtitle="Mensagens que a IA marcou como uso indevido do chat: assunto fora do programa, tentativa de burlar as regras, ofensa, pedido de dado sigiloso ou risco pessoal. A marca é feita pela IA e pode errar: leia a mensagem antes de agir."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o uso do suporte."
      />

      {data && (
        <div className="space-y-6">
          {!data.agentConfigured && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              A IA de suporte está desligada neste ambiente, então nenhuma mensagem nova é marcada.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            <Field label="Período" htmlFor="uso-periodo">
              <Select id="uso-periodo" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {PERIODS.map((period) => (
                  <option key={period.days} value={period.days}>
                    {period.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de ocorrência" htmlFor="uso-categoria">
              <Select id="uso-categoria" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Todos</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <section aria-labelledby="uso-alunos">
            <h2 id="uso-alunos" className="mb-1 text-lg font-bold text-(--text-main)">
              Alunos com ocorrências ({data.members.length})
            </h2>
            <p className="mb-4 text-sm text-(--text-muted)">
              Clique em um aluno para ver só as mensagens dele. Ocorrências graves são tentativa de
              burlar as regras, ofensa e risco pessoal.
            </p>
            {data.members.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-(--border-subtle) bg-(--bg-surface)">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--border-subtle) text-xs uppercase tracking-wider text-(--text-muted)">
                      <th scope="col" className="px-5 py-3 font-bold">Aluno</th>
                      <th scope="col" className="px-5 py-3 font-bold">Plano</th>
                      <th scope="col" className="px-5 py-3 font-bold">Ocorrências</th>
                      <th scope="col" className="px-5 py-3 font-bold">Graves</th>
                      <th scope="col" className="px-5 py-3 font-bold">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((member) => (
                      <tr
                        key={member.memberId}
                        className={
                          member.memberId === memberId
                            ? "border-b border-(--border-subtle) bg-(--bg-surface-muted) last:border-0"
                            : "border-b border-(--border-subtle) last:border-0"
                        }
                      >
                        <th scope="row" className="px-5 py-3 font-normal">
                          <button
                            type="button"
                            onClick={() => setMemberId(member.memberId === memberId ? "" : member.memberId)}
                            aria-pressed={member.memberId === memberId}
                            className="cursor-pointer text-left"
                          >
                            <span className="block font-bold text-(--text-main) underline-offset-2 hover:underline">
                              {member.name}
                            </span>
                            <span className="block text-xs text-(--text-muted)">{member.email}</span>
                          </button>
                        </th>
                        <td className="px-5 py-3">
                          <PlanBadge plan={member.plan} />
                        </td>
                        <td className="px-5 py-3 font-bold tabular-nums text-(--text-main)">{member.total}</td>
                        <td className="px-5 py-3">
                          {member.severe > 0 ? (
                            <Badge tone="danger">{member.severe}</Badge>
                          ) : (
                            <span className="text-(--text-muted)">0</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-(--text-muted)">{formatDateTime(member.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Nenhuma ocorrência no período.</EmptyState>
            )}
          </section>

          <section aria-labelledby="uso-ocorrencias">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 id="uso-ocorrencias" className="text-lg font-bold text-(--text-main)">
                Mensagens marcadas ({data.occurrences.length})
              </h2>
              {selected && (
                <button
                  type="button"
                  onClick={() => setMemberId("")}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-(--bg-surface-muted) px-3 py-1 text-xs font-bold text-(--text-main)"
                >
                  Só de {selected.name}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Remover filtro de aluno</span>
                </button>
              )}
            </div>

            {data.occurrences.length === 0 && <EmptyState>Nenhuma mensagem marcada com esses filtros.</EmptyState>}

            <div className="space-y-3">
              {data.occurrences.map((item) => (
                <Card key={item.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isSevere(item.category) ? "danger" : "warning"}>{labelOf(item.category)}</Badge>
                    <button
                      type="button"
                      onClick={() => navigate(`/adm/alunos/${encodeURIComponent(item.memberId)}`)}
                      className="cursor-pointer text-sm font-bold text-(--text-main) underline-offset-2 hover:underline"
                    >
                      {item.name}
                    </button>
                    <span className="text-xs text-(--text-muted)">{formatDateTime(item.createdAt)}</span>
                    <button
                      type="button"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          method: "delete",
                          path: `/support/flags/${item.id}`,
                          success: "Ocorrência removida.",
                        })
                      }
                      className="ml-auto cursor-pointer text-xs font-bold text-(--text-muted) underline-offset-2 hover:text-(--text-main) hover:underline disabled:opacity-50"
                    >
                      Não é uso indevido
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-(--text-main)">{item.content}</p>
                  {item.reply && (
                    <p className="mt-3 whitespace-pre-wrap border-l-2 border-(--border-subtle) pl-3 text-sm text-(--text-muted)">
                      <span className="font-bold">Resposta da IA:</span> {item.reply}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
