import { create } from "zustand";
import { createSafeStorage } from "../lib/safe-storage";
import { persist, createJSONStorage } from "zustand/middleware";
import axios from "axios";
import { queryClient } from "../lib/query-client";
import type { PlanId } from "../types/catalog";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** Plano contratado: define os entregáveis liberados e a identidade da tela. */
  plan: PlanId;
  planName: string;
  planStatus?: string;
  /** Equipe da Gestão 360. */
  isPlatformAdmin?: boolean;
  /**
   * Papel na equipe: o master gerencia a equipe e vê tudo; os demais, só as
   * áreas de adminPermissions. Sessão antiga, sem o campo, vale como master
   * até a próxima conferência em /api/auth/me.
   */
  adminRole?: "master" | "admin" | null;
  /** Áreas do /adm liberadas para quem não é master. */
  adminPermissions?: string[];
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  /** O servidor informou um plano diferente do guardado (ex.: virou Premium). */
  syncPlan: (plan: PlanId, planName: string) => void;
  /** Dados atuais vindos de /api/auth/me (plano, papel e áreas da equipe). */
  syncUser: (user: User) => void;
  logout: () => void;
  forgotPassword: (
    email: string,
  ) => Promise<{ success: boolean; message: string }>;
  resetPassword: (
    token: string,
    password: string,
  ) => Promise<{ success: boolean; message: string }>;
  invalidateSession: (message?: string) => void;
  clearError: () => void;
}

const API_URL = "/api/auth";

const SIGNED_OUT = {
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...SIGNED_OUT,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/login`, {
            email,
            password,
          });
          const { token, refreshToken, user } = response.data;

          queryClient.clear();
          set({
            token,
            refreshToken,
            user,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        } catch (error: any) {
          console.error("Login error:", error);
          const message = error.response
            ? error.response.data?.message || "Erro ao realizar login. Tente novamente."
            : "Não foi possível falar com o servidor. Confira se a API está no ar.";
          set({ error: message, isLoading: false, isAuthenticated: false });
          return false;
        }
      },

      syncPlan: (plan, planName) =>
        set((state) => ({
          user: state.user ? { ...state.user, plan, planName } : state.user,
        })),

      syncUser: (user) =>
        set((state) => {
          // Mesma pessoa e nada mudou: não mexe no estado (evita redesenhar a tela).
          if (!state.user || state.user.id !== user.id) return {};
          const next = { ...state.user, ...user };
          return JSON.stringify(next) === JSON.stringify(state.user) ? {} : { user: next };
        }),

      logout: () => {
        // Em ambiente fechado (homologação), sair da conta também fecha o
        // portão: a senha do ambiente volta a ser pedida no próximo acesso.
        if (import.meta.env.VITE_AMBIENTE === "homologacao") {
          void fetch("/__portao/sair", { method: "POST", credentials: "include" }).catch(
            () => undefined,
          );
        }

        // Avisa o servidor para encerrar a sessão de verdade (o refresh token
        // deixa de valer). Falha de rede não impede a saída local.
        const currentRefreshToken = get().refreshToken;
        if (currentRefreshToken) {
          void axios
            .post(`${API_URL}/logout`, { refreshToken: currentRefreshToken })
            .catch(() => undefined);
        }
        queryClient.clear();
        set({ ...SIGNED_OUT, error: null });
      },

      invalidateSession: (message) => {
        queryClient.clear();
        set({
          ...SIGNED_OUT,
          error: message || "Sua sessão expirou. Faça login novamente.",
        });
      },

      forgotPassword: async (email) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/forgot-password`, {
            email,
          });
          set({ isLoading: false, error: null });
          return { success: true, message: response.data.message };
        } catch (error: any) {
          const message =
            error.response?.data?.message || "Erro ao redefinir a senha.";
          set({ isLoading: false, error: message });
          return { success: false, message };
        }
      },

      resetPassword: async (token, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/reset-password`, {
            token,
            password,
          });
          set({ isLoading: false, error: null });
          return { success: true, message: response.data.message };
        } catch (error: any) {
          const message =
            error.response?.data?.message || "Erro ao redefinir a senha.";
          set({ isLoading: false, error: message });
          return { success: false, message };
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "go_x_360_auth_storage",
      storage: createJSONStorage(() => createSafeStorage()),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<AuthState>) || {};
        const hasPersistedSession = Boolean(
          persisted.user && (persisted.token || persisted.refreshToken),
        );

        return {
          ...currentState,
          ...persisted,
          isAuthenticated: hasPersistedSession,
          isLoading: false,
          error: null,
        };
      },
    },
  ),
);
