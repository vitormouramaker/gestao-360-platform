import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAuthStore } from "../../../store/use-auth-store";
import type { Catalog } from "../../../types/catalog";

/** Entregáveis dos planos, já com o que está liberado para quem está logado. */
export function useCatalogQuery() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: ["catalog", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { token } = useAuthStore.getState();
      const response = await axios.get<Catalog>("/api/catalog", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
  });
}
