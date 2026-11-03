import { useAuthStore } from "../store/use-auth-store";
import type { PlanId } from "../types/catalog";
import { usePathname } from "./navigation";

/**
 * A identidade visual acompanha o plano: Essencial (claro, azul-marinho) ou
 * Premium (preto). Quem não está logado e o painel /adm usam a do Essencial.
 */
export function applyPlanTheme(plan: PlanId | null | undefined) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved: PlanId = plan === "premium" ? "premium" : "essencial";
  document.documentElement.dataset.plan = resolved;
  document.documentElement.style.colorScheme = resolved === "premium" ? "dark" : "light";
}

export function isAdminPath(pathname: string) {
  return pathname === "/adm" || pathname.startsWith("/adm/");
}

/** Aplica o tema certo para a tela atual e para quem está logado. */
export function syncPlanTheme() {
  const plan = useAuthStore.getState().user?.plan;
  applyPlanTheme(isAdminPath(window.location.pathname) ? "essencial" : plan);
}

export function useIsDarkMode() {
  const pathname = usePathname();
  const isPremium = useAuthStore((state) => state.user?.plan === "premium");
  return isPremium && !isAdminPath(pathname);
}
