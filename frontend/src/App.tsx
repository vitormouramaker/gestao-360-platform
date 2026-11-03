import { useEffect, useState } from "react";
import { AdminApp } from "./features/admin/components/admin-app";
import { AppShell } from "./features/layout/components/app-shell";
import { LoginPage } from "./features/auth/components/login-page";
import { ForgotPasswordPage } from "./features/auth/components/forgot-password-page";
import { ResetPasswordPage } from "./features/auth/components/reset-password-page";
import { AccessLinkPage } from "./features/auth/components/access-link-page";
import { LegalPage } from "./features/legal/components/legal-page";
import { ThankYouPage } from "./features/thanks/components/thank-you-page";
import { navigate, usePathname } from "./lib/navigation";
import { isAdminPath, syncPlanTheme } from "./lib/plan-theme";
import { useAuthStore } from "./store/use-auth-store";

export function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const clearError = useAuthStore((state) => state.clearError);
  const [showForgot, setShowForgot] = useState(false);
  const pathname = usePathname();

  // O painel /adm usa sempre a identidade clara; a área do aluno, a do plano.
  useEffect(() => {
    syncPlanTheme();
  }, [pathname]);

  const goToLogin = () => {
    clearError();
    setShowForgot(false);
    navigate("/", { replace: true });
  };

  // Documentos públicos: abrem com ou sem login.
  if (pathname === "/termos") return <LegalPage document="termos" />;
  if (pathname === "/privacidade") return <LegalPage document="privacidade" />;

  // Página de obrigado: a Hubla manda o comprador para cá depois do pagamento.
  if (pathname.replace(/\/+$/, "") === "/obrigado") return <ThankYouPage />;

  if (pathname === "/reset-password") {
    return <ResetPasswordPage onGoBack={goToLogin} />;
  }

  // Link curto de primeiro acesso (/acesso/CODIGO), do e-mail ou mandado pela equipe.
  const accessCode = pathname.match(/^\/acesso\/([A-Za-z0-9-]+)\/?$/)?.[1];
  if (accessCode) return <AccessLinkPage code={accessCode} onGoBack={goToLogin} />;

  // Primeiro acesso: o link do e-mail de boas-vindas traz o cliente para cá.
  if (pathname === "/criar-senha") {
    return <ResetPasswordPage mode="setup" onGoBack={goToLogin} />;
  }

  // Se não estiver autenticado, mostramos o fluxo de Login/Esqueci a Senha
  if (!isAuthenticated) {
    if (showForgot) {
      return <ForgotPasswordPage onGoBack={goToLogin} />;
    }
    return (
      <LoginPage
        onGoToForgot={() => {
          clearError();
          setShowForgot(true);
        }}
      />
    );
  }

  // Painel da equipe da Gestão 360 em endereço próprio, com layout próprio.
  if (isAdminPath(pathname)) {
    return <AdminApp pathname={pathname} />;
  }

  return <AppShell />;
}
