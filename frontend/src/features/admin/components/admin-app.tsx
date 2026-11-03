import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CircleDollarSign,
  FolderDown,
  GraduationCap,
  Headset,
  Settings,
  Ticket,
  ShieldQuestion,
  CalendarDays,
  ClipboardList,
  FileCheck,
  LayoutDashboard,
  Link2,
  Webhook,
  LogOut,
  Menu,
  ShieldAlert,
  UserCog,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "../../../components/brand/brand-logo";
import { Button } from "../../../components/ui/button";
import { navigate } from "../../../lib/navigation";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { useSessionHeartbeat } from "../../auth/use-session-heartbeat";
import { sidebarItemClass } from "../../layout/components/sidebar";
import { canOpenAdminPath } from "../admin-access";
import { AdminActivitiesPage } from "./admin-activities-page";
import { AdminToolsPage } from "./admin-tools-page";
import { AiUsagePage } from "./ai-usage-page";
import { EventsPage } from "./events-page";
import { HublaPage } from "./hubla-page";
import { InsightsPage } from "./insights-page";
import { KnowledgePage } from "./knowledge-page";
import { MemberDetailPage } from "./member-detail-page";
import { MembersPage } from "./members-page";
import { OnboardingCallsPage } from "./onboarding-calls-page";
import { OverviewPage } from "./overview-page";
import { PlanEditorPage } from "./plan-editor-page";
import { PlansPage } from "./plans-page";
import { ProductsPage } from "./products-page";
import { SettingsPage } from "./settings-page";
import { SupportUsagePage } from "./support-usage-page";
import { TeamPage } from "./team-page";
import { TicketCheckPage } from "./ticket-check-page";
import { TicketsPage } from "./tickets-page";

interface AdminAppProps {
  pathname: string;
}

const NAV_ITEMS: Array<{ path: string; label: string; icon: LucideIcon }> = [
  { path: "/adm", label: "Visão geral", icon: LayoutDashboard },
  { path: "/adm/atendimento", label: "Atendimento", icon: Headset },
  { path: "/adm/planos", label: "Planos", icon: FileCheck },
  { path: "/adm/alunos", label: "Alunos", icon: Users },
  { path: "/adm/atividades", label: "Atividades", icon: ClipboardList },
  { path: "/adm/calendario", label: "Calendário", icon: CalendarDays },
  { path: "/adm/integracao-crm", label: "Integração CRM", icon: Video },
  { path: "/adm/ingresso", label: "Ingressos", icon: Ticket },
  { path: "/adm/entregaveis", label: "Entregáveis", icon: Link2 },
  { path: "/adm/ferramentas", label: "Ferramentas", icon: FolderDown },
  { path: "/adm/conhecimento", label: "Base de conhecimento", icon: BookOpen },
  { path: "/adm/aprendizado", label: "Aprendizado da IA", icon: GraduationCap },
  { path: "/adm/uso-do-suporte", label: "Uso do suporte", icon: ShieldQuestion },
  { path: "/adm/custos-da-ia", label: "Custos da IA", icon: CircleDollarSign },
  { path: "/adm/hubla", label: "Hubla", icon: Webhook },
  { path: "/adm/equipe", label: "Equipe", icon: UserCog },
  { path: "/adm/configuracoes", label: "Configurações", icon: Settings },
];
// A área que cada tela exige (e quem vê o quê) fica em ADMIN_PAGE_AREA, em ../admin-access.

/** Tela que a pessoa da equipe não tem liberada: nada da tela é carregado. */
function NoPermission() {
  return (
    <div className="w-full px-4 py-8 sm:px-8 2xl:px-12">
      <div className="max-w-xl rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-(--text-muted)" />
          <div>
            <p role="alert" className="text-sm font-bold text-(--text-main)">
              Você não tem permissão para esta área. Fale com o administrador master.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate("/adm")}>
              Ir para a Visão geral
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isActive(itemPath: string, pathname: string) {
  return itemPath === "/adm" ? pathname === "/adm" : pathname.startsWith(itemPath);
}

/**
 * Painel de administração (/adm): onde a equipe da Gestão 360 acompanha os alunos,
 * analisa diagnósticos, monta planos de ação e mantém o calendário.
 */
export function AdminApp({ pathname }: AdminAppProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [mobileOpen, setMobileOpen] = useState(false);
  const caminho = pathname.replace(/\/+$/, "") || "/adm";
  // Confere a sessão também no painel: papel e áreas podem mudar a qualquer momento.
  useSessionHeartbeat();

  if (!user?.isPlatformAdmin) {
    return (
      <div className="g360-auth-screen grid min-h-dvh place-items-center p-6">
        <div className="g360-auth-card w-full max-w-md rounded-3xl border p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-(--text-muted)" />
          <h1 className="mt-4 text-xl font-extrabold text-(--text-main)">Acesso restrito</h1>
          <p className="mt-2 text-sm font-medium text-(--text-muted)">
            Esta área é só para a equipe da Gestão 360.
          </p>
          <Button className="mt-6" onClick={() => navigate("/", { replace: true })}>
            Voltar para a plataforma
          </Button>
        </div>
      </div>
    );
  }

  const memberMatch = caminho.match(/^\/adm\/alunos\/([^/]+)$/);
  const planMatch = caminho.match(/^\/adm\/planos\/([^/]+)$/);

  const navItems = NAV_ITEMS.filter((item) => canOpenAdminPath(user, item.path));

  const renderPage = () => {
    // Antes de montar a tela (e disparar as consultas dela), confere a permissão.
    if (!canOpenAdminPath(user, caminho)) return <NoPermission />;
    if (caminho === "/adm/equipe") return <TeamPage />;
    if (memberMatch) {
      const memberId = decodeURIComponent(memberMatch[1]);
      return <MemberDetailPage key={memberId} memberId={memberId} />;
    }
    if (planMatch) {
      const planId = decodeURIComponent(planMatch[1]);
      return <PlanEditorPage key={planId} planId={planId} />;
    }
    if (caminho === "/adm/atendimento") return <TicketsPage adminId={user?.id} />;
    if (caminho === "/adm/planos") return <PlansPage />;
    if (caminho === "/adm/ingresso" || caminho.startsWith("/adm/ingresso/")) {
      const code = caminho.split("/")[3];
      return <TicketCheckPage code={code ? decodeURIComponent(code) : null} />;
    }
    if (caminho === "/adm/alunos") return <MembersPage />;
    if (caminho === "/adm/atividades") return <AdminActivitiesPage />;
    if (caminho === "/adm/hubla") return <HublaPage />;
    if (caminho === "/adm/conhecimento") return <KnowledgePage />;
    if (caminho === "/adm/aprendizado") return <InsightsPage />;
    if (caminho === "/adm/uso-do-suporte") return <SupportUsagePage />;
    if (caminho === "/adm/custos-da-ia") return <AiUsagePage />;
    if (caminho === "/adm/configuracoes") return <SettingsPage />;
    if (caminho === "/adm/calendario") return <EventsPage />;
    if (caminho === "/adm/integracao-crm") return <OnboardingCallsPage />;
    if (caminho === "/adm/entregaveis") return <ProductsPage />;
    if (caminho === "/adm/ferramentas") return <AdminToolsPage />;
    return <OverviewPage />;
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-(--bg-app)">
      {mobileOpen && (
        <div
          className="g360-theme-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "g360-sidebar fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative flex justify-center px-5 pb-3 pt-5">
          <BrandLogo />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-(--sidebar-text-muted) hover:bg-(--sidebar-hover) lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Administração" className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {navItems.map((item) => {
            const active = isActive(item.path, caminho);
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                className={sidebarItemClass(active)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-(--sidebar-border) p-3">
          <p className="truncate px-3 py-1 text-xs text-(--sidebar-text-muted)">{user.email}</p>
          <button type="button" onClick={() => navigate("/")} className={sidebarItemClass(false)}>
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Ver área do aluno
          </button>
          <button type="button" onClick={logout} className={sidebarItemClass(false)}>
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="g360-app-header flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg text-(--text-main) hover:bg-(--bg-surface-muted)"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-(--text-main)">Administração</span>
        </header>
        <main className="flex-1 overflow-y-auto pb-12">{renderPage()}</main>
      </div>
    </div>
  );
}
