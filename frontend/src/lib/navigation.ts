import { useSyncExternalStore } from "react";

/**
 * Navegação sem recarregar a página. Todo mundo que precisa saber o endereço
 * atual usa `usePathname`, então área do aluno e painel /adm trocam de tela
 * juntos e o botão voltar do navegador funciona.
 */
const NAVIGATION_EVENT = "app:navigate";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATION_EVENT, onChange);
  };
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  if (window.location.pathname + window.location.search !== to) {
    if (replace) {
      window.history.replaceState({}, "", to);
    } else {
      window.history.pushState({}, "", to);
    }
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}
