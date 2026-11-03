import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { useAdminAiUsage } from "../admin-api";

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const number = new Intl.NumberFormat("pt-BR");

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, index - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Custos da IA: quanto cada tipo de uso consumiu da API em cada mês. O valor
 * é uma estimativa pela tabela pública de preços; a cobrança real está no
 * console da Anthropic.
 */
export function AiUsagePage() {
  const query = useAdminAiUsage();
  const data = query.data;

  return (
    <Page
      title="Custos da IA"
      subtitle="Consumo da API por mês e por tipo de uso, com o valor estimado em dólar. A cobrança real e o saldo de créditos ficam no console da Anthropic."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o consumo da IA."
      />

      {data && (
        <div className="space-y-5">
          {!data.agentConfigured && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              A IA está desligada neste ambiente, então não há consumo novo.
            </p>
          )}

          {data.months.length === 0 && (
            <EmptyState>Nenhuma chamada à IA registrada ainda. O registro começou em outubro de 2026.</EmptyState>
          )}

          {data.months.map((month) => (
            <Card key={month.month}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-(--text-main)">{monthLabel(month.month)}</h2>
                <p className="text-sm text-(--text-muted)">
                  Total estimado:{" "}
                  <strong className="tabular-nums text-(--text-main)">{usd.format(month.costUsd)}</strong>
                  {data.students > 0 && (
                    <>
                      {" "}
                      · {usd.format(month.costUsd / data.students)} por aluno ({data.students} hoje)
                    </>
                  )}
                </p>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--border-subtle) text-xs uppercase tracking-wider text-(--text-muted)">
                      <th scope="col" className="py-2 pr-4 font-bold">Uso</th>
                      <th scope="col" className="py-2 pr-4 font-bold">Chamadas</th>
                      <th scope="col" className="py-2 pr-4 font-bold">Tokens</th>
                      <th scope="col" className="py-2 pr-4 font-bold">Custo por chamada</th>
                      <th scope="col" className="py-2 font-bold">Custo no mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {month.items.map((item) => (
                      <tr key={item.kind} className="border-b border-(--border-subtle) last:border-0">
                        <th scope="row" className="py-3 pr-4 font-normal">
                          <span className="block font-bold text-(--text-main)">{item.label}</span>
                          <span className="block text-xs text-(--text-muted)">{item.models.join(", ")}</span>
                        </th>
                        <td className="py-3 pr-4 tabular-nums text-(--text-main)">{number.format(item.calls)}</td>
                        <td className="py-3 pr-4 tabular-nums text-(--text-main)">{number.format(item.tokens)}</td>
                        <td className="py-3 pr-4 tabular-nums text-(--text-main)">
                          {item.unknownPrice ? "sem tabela" : usd.format(item.costPerCallUsd)}
                        </td>
                        <td className="py-3 font-bold tabular-nums text-(--text-main)">
                          {item.unknownPrice ? "sem tabela" : usd.format(item.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <p className="text-xs font-medium text-(--text-muted)">
            Um rascunho de plano pode usar mais de uma chamada (correção automática ou novo pedido de
            rascunho). Valores em dólar, sem impostos nem câmbio.
          </p>
        </div>
      )}
    </Page>
  );
}
