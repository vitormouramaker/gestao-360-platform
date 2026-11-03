import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import { ToastRegion } from "./components/ui/toast-region";
import "./index.css";
import { AppLoadingScreen } from "./features/layout/components/app-loading-screen";
import { initializeApiOrigin } from "./lib/api";
import { syncPlanTheme } from "./lib/plan-theme";
import { queryClient } from "./lib/query-client";
import { useAuthStore } from "./store/use-auth-store";

// A identidade (Essencial ou Premium) acompanha o plano de quem está logado.
syncPlanTheme();
useAuthStore.subscribe(syncPlanTheme);
const root = ReactDOM.createRoot(document.getElementById("app")!);

root.render(<AppLoadingScreen />);

// Falha aqui não pode deixar a tela em branco: o app sobe com o endereço
// padrão e as telas mostram o erro da requisição.
try {
  await initializeApiOrigin();
} catch (error) {
  console.error("[gestao-360] não foi possível descobrir o endereço da API:", error);
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <ToastRegion />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
