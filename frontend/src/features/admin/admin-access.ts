import { useAuthStore, type User } from "../../store/use-auth-store";

/** Áreas do /adm que o master libera para cada pessoa da equipe. */
export type AdminArea =
  | "students"
  | "plans"
  | "support"
  | "activities"
  | "calendar"
  | "tickets"
  | "onboarding"
  | "content"
  | "ai"
  | "costs"
  | "hubla"
  | "settings";

/**
 * Qual área cada tela do /adm exige. É a única fonte dessa regra: o menu, a
 * proteção das telas e os atalhos da Visão geral leem daqui.
 * "all" = toda a equipe; "master" = só o administrador master.
 * Vale para o endereço e para tudo abaixo dele (ex.: /adm/alunos/:id).
 */
export const ADMIN_PAGE_AREA: Record<string, AdminArea | "all" | "master"> = {
  "/adm": "all",
  "/adm/atendimento": "support",
  "/adm/planos": "plans",
  "/adm/alunos": "students",
  "/adm/atividades": "activities",
  "/adm/calendario": "calendar",
  "/adm/integracao-crm": "onboarding",
  "/adm/ingresso": "tickets",
  "/adm/entregaveis": "content",
  "/adm/ferramentas": "content",
  "/adm/conhecimento": "ai",
  "/adm/aprendizado": "ai",
  "/adm/uso-do-suporte": "ai",
  "/adm/custos-da-ia": "costs",
  "/adm/hubla": "hubla",
  "/adm/equipe": "master",
  "/adm/configuracoes": "settings",
};

/** Área exigida por um endereço do /adm. Endereço desconhecido cai na Visão geral. */
export function areaForAdminPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/adm";
  const match = Object.keys(ADMIN_PAGE_AREA)
    .filter((key) => key !== "/adm" && (path === key || path.startsWith(`${key}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return ADMIN_PAGE_AREA[match || "/adm"];
}

/** Master: papel "master" ou sessão antiga de admin ainda sem o campo. */
export function isAdminMaster(user: User | null | undefined) {
  return Boolean(user?.isPlatformAdmin && (user.adminRole === "master" || user.adminRole == null));
}

export function canOpenAdminPath(user: User | null | undefined, pathname: string) {
  if (!user?.isPlatformAdmin) return false;
  const area = areaForAdminPath(pathname);
  if (area === "all") return true;
  if (isAdminMaster(user)) return true;
  if (area === "master") return false;
  return (user.adminPermissions || []).includes(area);
}

/** Para as telas: `can("/adm/alunos")` diz se o atalho pode levar até lá. */
export function useAdminAccess() {
  const user = useAuthStore((state) => state.user);
  return {
    isMaster: isAdminMaster(user),
    can: (pathname: string) => canOpenAdminPath(user, pathname),
  };
}
