/**
 * Endereços das telas da área do aluno.
 *
 * Cada tela tem o seu endereço, então o botão voltar do navegador funciona.
 */

export type AppPage =
  | "home"
  | "diagnostic"
  | "action-plan"
  | "activities"
  | "calendar"
  | "tools"
  | "checkin"
  | "onboarding"
  | "plan";

const PAGE_PATHS: Record<AppPage, string> = {
  home: "/",
  diagnostic: "/diagnostico",
  "action-plan": "/plano-de-acao",
  activities: "/atividades",
  calendar: "/calendario",
  tools: "/ferramentas",
  checkin: "/check-in",
  onboarding: "/integracao-crm",
  plan: "/meu-plano",
};

/** Telas que só o plano Premium abre. */
export const PREMIUM_PAGES: AppPage[] = ["action-plan", "activities"];

export function isAppPage(value: string | null | undefined): value is AppPage {
  return Boolean(value && value in PAGE_PATHS);
}

/** Lê o endereço atual (ou o informado) e devolve a tela correspondente. */
export function parseRoute(pathname: string = window.location.pathname): AppPage {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  const entrada = Object.entries(PAGE_PATHS).find(([, path]) => path === caminho);
  return (entrada?.[0] as AppPage) || "home";
}

/** Monta o endereço de uma tela. */
export function buildPath(page: AppPage): string {
  return PAGE_PATHS[page];
}
