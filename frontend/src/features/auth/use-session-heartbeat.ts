import { useEffect } from "react";
import axios from "axios";
import { authConfig } from "../../lib/http";
import { useAuthStore, type User } from "../../store/use-auth-store";

const HEARTBEAT_MS = 60 * 1000;

/**
 * Confere a sessão no servidor a cada minuto e quando a janela volta ao foco.
 * Sem isso, quem teve a assinatura suspensa (cancelamento, reembolso) seguiria
 * vendo o que já estava carregado até a próxima chamada. A resposta de sessão
 * encerrada é tratada no interceptor do axios, que leva para a tela de acesso.
 */
export function useSessionHeartbeat() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;

    let lastCheck = Date.now();
    const check = () => {
      lastCheck = Date.now();
      // Falha de rede não derruba ninguém: só a recusa do servidor conta.
      axios
        .get<{ user?: User }>("/api/auth/me", authConfig())
        // A resposta também atualiza o papel e as áreas da equipe (podem mudar a qualquer momento).
        .then((response) => {
          if (response.data?.user) useAuthStore.getState().syncUser(response.data.user);
        })
        .catch(() => undefined);
    };
    // Primeira conferência logo ao abrir: sessão guardada pode estar desatualizada.
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > 5000) check();
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [token]);
}
