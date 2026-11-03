import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { PREMIUM_PAGES } from "../../../lib/app-router";
import { useAuthStore } from "../../../store/use-auth-store";
import { useSessionHeartbeat } from "../../auth/use-session-heartbeat";
import { ActivitiesPage } from "../../activities/components/activities-page";
import { CalendarPage } from "../../calendar/components/calendar-page";
import { CheckinPage } from "../../checkin/components/checkin-page";
import { AnamnesePage } from "../../diagnostic/components/anamnese-page";
import { DiagnosticPage } from "../../diagnostic/components/diagnostic-page";
import { useDiagnosticQuery } from "../../diagnostic/hooks/use-diagnostic-query";
import { HomePage } from "../../home/components/home-page";
import { OnboardingPage } from "../../onboarding/components/onboarding-page";
import { useCatalogQuery } from "../../home/hooks/use-catalog-query";
import { ActionPlanPage } from "../../plan/components/action-plan-page";
import { PlanPage } from "../../plans/components/plan-page";
import { PremiumLockedPage } from "../../plans/components/premium-locked-page";
import { PremiumModal } from "../../plans/components/premium-modal";
import { SupportBubble } from "../../support/components/support-bubble";
import { ToolsPage } from "../../tools/components/tools-page";
import { useAppRouting } from "../hooks/use-app-routing";
import { AppHeader } from "./app-header";
import { AppLoadingScreen } from "./app-loading-screen";
import { Sidebar } from "./sidebar";

export function AppShell() {
  useSessionHeartbeat();
  const { page, navigate } = useAppRouting();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  // Abre logo depois do envio da anamnese, já com a plataforma liberada ao fundo.
  const [anamneseSentOpen, setAnamneseSentOpen] = useState(false);

  const userPlan = useAuthStore((state) => state.user?.plan);
  const isAdmin = useAuthStore((state) => Boolean(state.user?.isPlatformAdmin));
  const logout = useAuthStore((state) => state.logout);
  const syncPlan = useAuthStore((state) => state.syncPlan);
  const catalog = useCatalogQuery().data;
  const diagnosticQuery = useDiagnosticQuery();

  // O plano pode mudar depois do login (ex.: compra do Premium): vale o do servidor.
  useEffect(() => {
    if (catalog && catalog.plan !== userPlan) {
      syncPlan(catalog.plan, catalog.planName);
    }
  }, [catalog, userPlan, syncPlan]);

  // Primeiro acesso: antes de tudo, a anamnese. A equipe da Gestão 360 entra direto.
  if (!isAdmin) {
    if (diagnosticQuery.isPending) {
      return <AppLoadingScreen />;
    }
    if (diagnosticQuery.isError) {
      return (
        <div className="g360-auth-screen grid min-h-dvh place-items-center p-6">
          <div className="g360-auth-card w-full max-w-md rounded-3xl border p-8 text-center">
            <h1 className="text-xl font-extrabold text-(--text-main)">Não foi possível carregar</h1>
            <p className="mt-2 text-sm font-medium text-(--text-muted)">
              Confira a sua conexão e tente de novo.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="secondary" onClick={logout}>
                Sair
              </Button>
              <Button onClick={() => void diagnosticQuery.refetch()}>Tentar novamente</Button>
            </div>
          </div>
        </div>
      );
    }
    if (diagnosticQuery.data.diagnostic?.status !== "submitted") {
      return (
        <AnamnesePage
          questions={diagnosticQuery.data.questions}
          draft={diagnosticQuery.data.diagnostic}
          onSubmitted={() => setAnamneseSentOpen(true)}
        />
      );
    }
  }

  const openPremium = () => setPremiumModalOpen(true);
  const premiumLocked = userPlan !== "premium" && PREMIUM_PAGES.includes(page);

  const renderPage = () => {
    if (page === "diagnostic") return <DiagnosticPage onOpenPremium={openPremium} />;
    if (page === "activities") {
      return premiumLocked ? (
        <PremiumLockedPage title="Atividades Práticas" onOpenPremium={openPremium} />
      ) : (
        <ActivitiesPage />
      );
    }
    if (page === "calendar") return <CalendarPage onOpenPremium={openPremium} />;
    if (page === "checkin") return <CheckinPage />;
    if (page === "tools") return <ToolsPage />;
    if (page === "onboarding") return <OnboardingPage />;
    if (page === "plan") return <PlanPage onOpenPremium={openPremium} />;
    if (page === "action-plan") {
      return premiumLocked ? (
        <PremiumLockedPage title="Plano de Ação" onOpenPremium={openPremium} />
      ) : (
        <ActionPlanPage />
      );
    }
    return <HomePage search={search} onOpenPremium={openPremium} onNavigate={navigate} />;
  };

  return (
    <div className="g360-print-root flex h-dvh overflow-hidden bg-(--bg-app)">
      <Sidebar
        page={page}
        onNavigate={navigate}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          showSearch={page === "home"}
          search={search}
          onSearchChange={setSearch}
          onOpenMenu={() => setMobileMenuOpen(true)}
          groupUrl={catalog?.products.find((product) => product.slug === "grupo-whatsapp")?.accessUrl}
        />
        <main className="flex-1 overflow-y-auto pb-24">
          {catalog?.renewal && (
            <p
              role="status"
              className="g360-no-print mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 sm:mx-8 2xl:mx-12"
            >
              Sua assinatura renova em{" "}
              <strong>
                {new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
                  new Date(catalog.renewal.renewsAt),
                )}
              </strong>
              . Confira se o pagamento está em dia: sem a confirmação, o acesso é interrompido na hora.
            </p>
          )}
          {renderPage()}
        </main>
      </div>

      <SupportBubble />
      <PremiumModal open={premiumModalOpen} onClose={() => setPremiumModalOpen(false)} />

      <Modal
        open={anamneseSentOpen}
        title="Anamnese enviada"
        onClose={() => setAnamneseSentOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAnamneseSentOpen(false);
                navigate("diagnostic");
              }}
            >
              Acompanhar o diagnóstico
            </Button>
            <Button onClick={() => setAnamneseSentOpen(false)}>Entendi</Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--primary)/12 text-(--primary-text)">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="space-y-3 text-sm text-(--text-muted)">
            <p className="text-base font-bold text-(--text-main)">
              Recebemos as suas respostas e elas já estão em análise.
            </p>
            <p>
              {userPlan === "premium"
                ? "O seu Diagnóstico 360° e o seu plano de ação são preparados a partir do que você respondeu e revisados pelo nosso time antes de serem liberados."
                : "O seu Diagnóstico 360° é preparado a partir do que você respondeu e revisado pelo nosso time antes de ser liberado."}{" "}
              Isso leva até 72 horas úteis.
            </p>
            <p>
              {userPlan === "premium"
                ? "Assim que estiverem prontos, eles aparecem em Diagnóstico 360° e em Plano de ação."
                : "Assim que estiver pronto, ele aparece em Diagnóstico 360°."}{" "}
              Enquanto isso, a plataforma já está aberta para você.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
