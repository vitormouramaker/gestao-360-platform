import { cn } from "../../lib/utils";
import { Logo360 } from "./logo-360";

const PLAN_LABELS = {
  essencial: "Essencial",
  premium: "Premium",
  padrao: undefined,
};

interface BrandLogoProps {
  /** Plano de quem está logado; sem plano (ou no /adm) usa a marca padrão. */
  variant?: "essencial" | "premium" | "padrao" | null;
  className?: string;
}

/** Marca com texto branco: só para fundo escuro (barras laterais). */
export function BrandLogo({ variant, className }: BrandLogoProps) {
  return <Logo360 planLabel={PLAN_LABELS[variant || "padrao"]} className={cn("w-40 text-white", className)} />;
}
