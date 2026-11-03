import { useCallback } from "react";
import { buildPath, parseRoute, type AppPage } from "../../../lib/app-router";
import { navigate as navigateTo, usePathname } from "../../../lib/navigation";

/** Tela atual do app, sincronizada com o endereço do navegador. */
export function useAppRouting() {
  const page = parseRoute(usePathname());
  const navigate = useCallback((next: AppPage) => navigateTo(buildPath(next)), []);

  return { page, navigate };
}
