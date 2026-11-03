import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { isAppPage, type AppPage } from "../../../lib/app-router";
import { useAuthStore } from "../../../store/use-auth-store";
import { toast } from "../../../store/use-toast-store";
import { PLAN_NAMES, type PlanId, type Product } from "../../../types/catalog";
import { usePlanQuery } from "../../plan/hooks/use-plan-query";
import { useCatalogQuery } from "../hooks/use-catalog-query";
import { ProductCard } from "./product-card";
import { ProductCarousel } from "./product-carousel";

interface HomePageProps {
  search: string;
  onOpenPremium: () => void;
  onNavigate: (page: AppPage) => void;
}

const PLAN_ORDER: PlanId[] = ["essencial", "premium"];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function HomePage({ search, onOpenPremium, onNavigate }: HomePageProps) {
  const query = useCatalogQuery();
  const isPremium = useAuthStore((state) => state.user?.plan === "premium");
  const planUnseen = Boolean(usePlanQuery().data?.planUnseen);
  const termo = normalizar(search.trim());

  const handleOpen = (product: Product) => {
    if (product.locked) {
      onOpenPremium();
      return;
    }

    // Entregável que vive dentro da plataforma (diagnóstico, calendário...).
    if (isAppPage(product.page)) {
      onNavigate(product.page);
      return;
    }

    if (product.accessNote) {
      toast.info(product.name, { message: product.accessNote, duration: 9000 });
    }

    if (!product.accessUrl) {
      if (!product.accessNote) {
        toast.info("Em breve.", {
          message: `${product.name} está sendo preparado e logo aparece aqui.`,
        });
      }
      return;
    }

    window.open(product.accessUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full px-4 py-8 sm:px-8 2xl:px-12">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-(--text-main) sm:text-4xl">
          Gestão 360°
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-medium text-(--text-muted) sm:text-base">
          O programa por assinatura que acompanha, direciona e gerencia o seu negócio.
        </p>
      </header>

      {planUnseen && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--primary) bg-(--primary)/10 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--primary)/15 text-(--primary-text)">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-(--text-main)">
                {isPremium
                  ? "Seu plano de ação foi liberado"
                  : "Seu Diagnóstico 360° foi liberado"}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-(--text-muted)">
                {isPremium
                  ? "Nosso time concluiu a revisão. Abra para ver a sua leitura, a prioridade e as ações do ciclo."
                  : "Nosso time concluiu a revisão. Abra para ver a leitura do momento da sua empresa e o próximo passo."}
              </p>
            </div>
          </div>
          <Button onClick={() => onNavigate(isPremium ? "action-plan" : "diagnostic")}>
            {isPremium ? "Ver meu plano de ação" : "Ver meu diagnóstico"}
          </Button>
        </div>
      )}

      {query.isPending && (
        <div className="space-y-12">
          {PLAN_ORDER.map((plan) => (
            <div key={plan} className="space-y-4">
              <Skeleton className="h-6 w-44 rounded-full" />
              <div className="flex gap-4 overflow-hidden">
                {[0, 1, 2, 3, 4].map((item) => (
                  <Skeleton key={item} className="h-96 w-64 shrink-0 sm:w-72" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {query.isError && (
        <div
          role="alert"
          className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6"
        >
          <h2 className="text-lg font-bold text-(--text-main)">
            Não foi possível carregar seus entregáveis
          </h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            Confira sua conexão e tente de novo.
          </p>
          <Button className="mt-4" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {query.data && (
        <div className="space-y-12">
          {PLAN_ORDER.map((plan) => {
            const doPlano = query.data.products.filter((product) => product.plan === plan);
            const visiveis = termo
              ? doPlano.filter((product) => normalizar(product.name).includes(termo))
              : doPlano;
            const bloqueado = doPlano.some((product) => product.locked);

            return (
              <section key={plan} aria-labelledby={`plano-${plan}`}>
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2
                    id={`plano-${plan}`}
                    className="text-lg font-bold uppercase tracking-wide text-(--text-main) sm:text-xl"
                  >
                    {PLAN_NAMES[plan]}
                  </h2>
                  {bloqueado ? (
                    <button
                      type="button"
                      onClick={onOpenPremium}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-(--border-strong) px-3 py-1 text-xs font-bold text-(--text-main) transition-colors hover:bg-(--bg-surface-muted)"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Desbloquear
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-(--primary-text)">
                      <CheckCircle2 className="h-4 w-4" />
                      Incluso no seu plano
                    </span>
                  )}
                </div>

                {visiveis.length > 0 ? (
                  <ProductCarousel label={`Entregáveis de ${PLAN_NAMES[plan]}`}>
                    {visiveis.map((product) => (
                      <ProductCard key={product.id} product={product} onOpen={handleOpen} />
                    ))}
                  </ProductCarousel>
                ) : (
                  <p className="rounded-2xl border border-dashed border-(--border-strong) p-6 text-sm font-medium text-(--text-muted)">
                    {termo
                      ? `Nenhum entregável deste plano corresponde a “${search.trim()}”.`
                      : "Os entregáveis deste plano aparecem aqui em breve."}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
