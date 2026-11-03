import { Fragment } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  FolderDown,
  ClipboardList,
  FileText,
  Home,
  Lock,
  LogOut,
  ShieldCheck,
  TrendingUp,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "../../../components/brand/brand-logo";
import { PREMIUM_PAGES, type AppPage } from "../../../lib/app-router";
import { navigate } from "../../../lib/navigation";
import { cn, getInitials } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { useOnboardingQuery } from "../../onboarding/hooks/use-onboarding-query";
import { formatCallShort } from "../../onboarding/onboarding-format";
import { usePlanQuery } from "../../plan/hooks/use-plan-query";

/** Telas onde o aviso "Novo" aparece quando há plano liberado e não aberto. */
const PLAN_UNSEEN_PAGES: AppPage[] = ["diagnostic", "action-plan"];

interface SidebarProps {
  page: AppPage;
  onNavigate: (page: AppPage) => void;
  /** No celular a barra lateral vira uma gaveta. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ page: AppPage; label: string; icon: LucideIcon }> = [
  { page: "home", label: "Início", icon: Home },
  { page: "diagnostic", label: "Diagnóstico 360°", icon: TrendingUp },
  { page: "action-plan", label: "Plano de ação", icon: FileText },
  { page: "activities", label: "Atividades práticas", icon: ClipboardList },
  { page: "calendar", label: "Calendário", icon: CalendarDays },
  { page: "tools", label: "Ferramentas e modelos", icon: FolderDown },
  { page: "checkin", label: "Check-in mensal", icon: CalendarCheck },
];

export const sidebarItemClass = (active: boolean) =>
  cn(
    "flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
    active
      ? "bg-(--primary) text-white"
      : "text-(--sidebar-text-muted) hover:bg-(--sidebar-hover) hover:text-(--sidebar-text)",
  );

/**
 * Integração CRM: item em destaque, para o aluno notar. Sem agendamento,
 * mostra o selo "Agende"; com agendamento, a data e a hora marcadas.
 */
function OnboardingNavItem({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { data } = useOnboardingQuery();
  const booking = data?.booking?.status === "scheduled" ? data.booking : null;
  const done = !booking && Boolean(data?.lastDone);

  // CRM desligado para este aluno: o item nem aparece no menu.
  if (data?.enabled === false) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
        active
          ? "bg-(--primary) text-white"
          : "bg-(--primary)/20 text-(--sidebar-text) ring-1 ring-inset ring-(--primary)/60 hover:bg-(--primary)/30",
      )}
    >
      <Video className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block">Integração CRM</span>
        {booking && (
          <span className="block truncate text-[11px] font-semibold opacity-85">
            Agendada: {formatCallShort(booking.startsAt)}
          </span>
        )}
      </span>
      {booking || done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-label={booking ? "Agendada" : "Realizada"} />
      ) : (
        data && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              active ? "bg-white text-(--primary-hover)" : "bg-(--primary) text-white",
            )}
          >
            Agende
          </span>
        )
      )}
    </button>
  );
}

export function Sidebar({ page, onNavigate, mobileOpen, onCloseMobile }: SidebarProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const planUnseen = Boolean(usePlanQuery().data?.planUnseen);

  return (
    <>
      {mobileOpen && (
        <div
          className="g360-theme-overlay fixed inset-0 z-40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "g360-no-print g360-sidebar fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative flex justify-center px-5 pb-3 pt-5">
          <BrandLogo />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--sidebar-text-muted) hover:bg-(--sidebar-hover) lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Principal" className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const active = item.page === page;
            const Icon = item.icon;
            const bloqueado = user?.plan !== "premium" && PREMIUM_PAGES.includes(item.page);
            const novo = planUnseen && !bloqueado && PLAN_UNSEEN_PAGES.includes(item.page);

            return (
              <Fragment key={item.page}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(item.page);
                    onCloseMobile();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={sidebarItemClass(active)}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {novo && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        active ? "bg-white text-(--primary-hover)" : "bg-(--primary) text-white",
                      )}
                    >
                      Novo
                    </span>
                  )}
                  {bloqueado && <Lock className="h-3.5 w-3.5 shrink-0" aria-label="Assinatura Anual" />}
                </button>
                {/* Logo abaixo de Início, nos dois planos. */}
                {item.page === "home" && (
                  <OnboardingNavItem
                    active={page === "onboarding"}
                    onClick={() => {
                      onNavigate("onboarding");
                      onCloseMobile();
                    }}
                  />
                )}
              </Fragment>
            );
          })}

          {user?.isPlatformAdmin && (
            <button
              type="button"
              onClick={() => navigate("/adm")}
              className={cn(sidebarItemClass(false), "mt-3 border border-(--sidebar-border)")}
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">Painel adm</span>
            </button>
          )}
        </nav>

        <div className="border-t border-(--sidebar-border) p-3">
          <div className="flex items-center gap-3 px-2 pb-3 pt-2">
            <span className="relative shrink-0">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-(--primary) text-xs font-bold text-white">
                {getInitials(user?.name || "")}
              </span>
              {user?.planName && (
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-(--bg-sidebar) bg-(--primary) px-1.5 py-px text-[8px] font-bold uppercase leading-tight tracking-[0.08em] text-white">
                  {user.planName}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-(--sidebar-text)">
                {user?.name}
              </span>
              <span className="block truncate text-xs text-(--sidebar-text-muted)">
                {user?.email}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-1 flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold text-(--sidebar-text-muted) transition-colors hover:bg-(--sidebar-hover) hover:text-(--sidebar-text)"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
