import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { authConfig } from "../../../lib/http";
import { useAuthStore } from "../../../store/use-auth-store";
import type { Diagnostic, DiagnosticQuestion } from "../../../types/tracking";

export interface DiagnosticResponse {
  questions: DiagnosticQuestion[];
  diagnostic: Diagnostic | null;
}

export function diagnosticQueryKey(userId: string | undefined) {
  return ["diagnostic", userId];
}

/** Perguntas da anamnese e o que a pessoa já respondeu. */
export function useDiagnosticQuery() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: diagnosticQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      (await axios.get<DiagnosticResponse>("/api/diagnostic", authConfig())).data,
  });
}
