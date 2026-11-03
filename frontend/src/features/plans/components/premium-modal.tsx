import { createPortal } from "react-dom";
import { ArrowRight, Check, Crown, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useFecharComEsc } from "../../../lib/use-fechar-com-esc";
import { toast } from "../../../store/use-toast-store";
import { useCatalogQuery } from "../../home/hooks/use-catalog-query";

interface PremiumModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Oferta do plano Premium. Abre quando alguém do Essencial toca em um
 * entregável bloqueado. Sempre escuro: é a identidade do Premium.
 */
export function PremiumModal({ open, onClose }: PremiumModalProps) {
  const query = useCatalogQuery();
  useFecharComEsc(open, onClose);

  if (!open) return null;

  const premiumProducts = (query.data?.products || []).filter(
    (product) => product.plan === "premium",
  );
  const checkoutUrl = query.data?.upgrade.checkoutUrl || null;
  const price = query.data?.plans.find((plan) => plan.id === "premium")?.price;

  const handleBuy = () => {
    if (!checkoutUrl) {
      toast.info("Checkout em configuração.", {
        message: "Fale com o suporte para contratar a Assinatura Anual agora.",
      });
      return;
    }

    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div
      className="g360-theme-overlay fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-title"
        className="g360-modal-in relative w-full max-w-xl overflow-hidden rounded-t-3xl border border-white/10 bg-[#111111] text-white shadow-2xl sm:rounded-3xl"
      >
        <svg
          viewBox="0 0 400 400"
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 opacity-80"
        >
          <circle cx="200" cy="200" r="150" fill="none" stroke="#159b7b" strokeWidth="1.5" />
          <circle cx="250" cy="150" r="90" fill="#159b7b" opacity="0.28" />
        </svg>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative max-h-[88dvh] overflow-y-auto p-6 sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#159b7b] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
            <Crown className="h-3.5 w-3.5" />
            Assinatura Anual
          </span>

          <h2
            id="premium-modal-title"
            className="mt-4 max-w-md text-2xl font-extrabold leading-tight sm:text-3xl"
          >
            Ter um CNPJ é só o começo. A Assinatura Anual acompanha, direciona e gerencia o seu negócio.
          </h2>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-[#c9cdd1]">
            Hoje você organiza, capacita e desenvolve a empresa. Com a Assinatura
            Anual você mantém tudo isso e ganha um plano de ação feito a partir
            do seu diagnóstico, atividades semanais para tirá-lo do papel e mais
            encontros para o seu time e para você.
          </p>

          {premiumProducts.length > 0 && (
            <>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#a8adb2]">
                O que você desbloqueia
              </p>
              <ul className="mt-3 space-y-3">
                {premiumProducts.map((product) => (
                  <li key={product.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#159b7b]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{product.name}</span>
                      {product.description && (
                        <span className="block text-[13px] font-medium text-[#a8adb2]">
                          {product.description}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#159b7b]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  <span className="text-sm font-bold">
                    Tudo o que você já tem hoje
                  </span>
                </li>
              </ul>
            </>
          )}

          {/* Preço e compra ficam sempre à vista, mesmo com a lista rolando. */}
          <div className="sticky -bottom-6 -mx-6 mt-6 border-t border-white/10 bg-[#111111] px-6 pb-6 pt-4 sm:-bottom-8 sm:-mx-8 sm:px-8 sm:pb-8">
            {price && (
              <p className="text-sm font-medium text-[#c9cdd1]">
                Investimento:{" "}
                <span className="g360-brand-font text-2xl font-extrabold text-white">{price}</span>
              </p>
            )}

            <Button size="lg" onClick={handleBuy} className="mt-3 w-full text-base">
              Quero a Assinatura Anual
              <ArrowRight className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full cursor-pointer rounded-xl py-2 text-[13px] font-bold text-[#c9cdd1] transition-colors hover:text-white"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
