import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { authConfig } from "../../../lib/http";
import { useAuthStore } from "../../../store/use-auth-store";
import type { MemberPlanResponse } from "../../../types/tracking";

export function planQueryKey(userId: string | undefined) {
  return ["plan", userId];
}

/** O Diagnóstico 360° e o plano liberados para quem está logado. */
export function usePlanQuery() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: planQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => (await axios.get<MemberPlanResponse>("/api/plan", authConfig())).data,
  });
}

/**
 * Marca o último plano aprovado como visto. Ao abrir o Diagnóstico 360° (ou o
 * Plano de Ação), a consulta é refeita e o aviso "Novo" some.
 */
export function useMarkPlanSeenMutation() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => (await axios.post("/api/plan/seen", {}, authConfig())).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planQueryKey(userId) }),
  });
}
