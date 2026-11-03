import { Check, Crown, Lock } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { cn } from "../../../lib/utils";
import { PLAN_NAMES, type PlanId } from "../../../types/catalog";
import { useCatalogQuery } from "../../home/hooks/use-catalog-query";

interface PlanPageProps {
  onOpenPremium: () => void;
}

const PLAN_ORDER: PlanId[] = ["essencial", "premium"];

/** Minha assinatura: o plano contratado e o que cada plano entrega. */
export function PlanPage({ onOpenPremium }: PlanPageProps) {
  const query = useCatalogQuery();

  return (
    <div className="w-full px-4 py-8 sm:px-8 2xl:px-12">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-(--text-main)">Minha assinatura</h1>
        <p className="mt-2 text-sm font-medium text-(--text-muted)">
          Veja o plano que você assina e o que está incluso nele.
        </p>
      </header>

      {query.isPending && (
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {query.isError && (
        <div role="alert" className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6">
          <p className="text-sm font-medium text-(--text-muted)">
            Não foi possível carregar a sua assinatura.
          </p>
          <Button className="mt-4" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {query.data && (
        <div className="grid gap-5 md:grid-cols-2">
          {PLAN_ORDER.map((plan) => {
            const products = query.data.products.filter((product) => product.plan === plan);
            const atual = query.data.plan === plan;
            const incluso = products.every((product) => !product.locked);
            const price = query.data.plans.find((item) => item.id === plan)?.price;

            return (
              <section
                key={plan}
                className={cn(
                  "flex flex-col rounded-2xl border bg-(--bg-surface) p-6",
                  atual ? "border-(--primary) ring-1 ring-(--primary)" : "border-(--border-subtle)",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-(--text-main)">
                    {plan === "premium" && <Crown className="h-5 w-5 text-(--primary-text)" />}
                    {PLAN_NAMES[plan]}
                  </h2>
                  {atual && (
                    <span className="rounded-full bg-(--primary) px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                      Seu plano
                    </span>
                  )}
                </div>

                {price && (
                  <p className="g360-brand-font mt-2 text-2xl font-extrabold text-(--text-main)">
                    {price}
                  </p>
                )}

                <ul className="mt-5 flex-1 space-y-3">
                  {plan === "premium" && (
                    <li className="flex items-start gap-3 text-sm font-medium text-(--text-main)">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-text)" />
                      Tudo o que você já tem hoje
                    </li>
                  )}
                  {products.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-start gap-3 text-sm font-medium text-(--text-main)"
                    >
                      {product.locked ? (
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-(--text-muted)" />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-text)" />
                      )}
                      {product.name}
                    </li>
                  ))}
                </ul>

                {!incluso && (
                  <Button size="lg" className="mt-6 w-full" onClick={onOpenPremium}>
                    Conhecer a Assinatura Anual
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
