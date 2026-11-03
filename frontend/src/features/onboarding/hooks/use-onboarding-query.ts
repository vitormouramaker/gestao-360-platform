import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { authConfig } from "../../../lib/http";
import { useAuthStore } from "../../../store/use-auth-store";
import type { OnboardingResponse } from "../../../types/tracking";

export function onboardingQueryKey(userId: string | undefined) {
  return ["onboarding", userId];
}

/**
 * Agendamento da integração do CRM e os horários livres. A tela e o destaque
 * do menu lateral usam a mesma consulta.
 */
export function useOnboardingQuery() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: onboardingQueryKey(userId),
    enabled: Boolean(userId),
    // Horários e link da chamada mudam sem a pessoa mexer: confere ao voltar para a aba.
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (await axios.get<OnboardingResponse>("/api/onboarding", authConfig())).data,
  });
}
