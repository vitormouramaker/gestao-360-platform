import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "../store/use-toast-store";
import { adminPermissionMessage, isAdminPermissionError } from "./admin-permission-error";

// Instância única, acessível fora dos componentes (ex.: ao trocar de conta no store).
export const queryClient = new QueryClient({
  // Área do /adm sem permissão: avisa com a mensagem do servidor (uma vez só).
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAdminPermissionError(error)) {
        toast.custom({ id: "admin-permission", tone: "error", title: adminPermissionMessage(error) });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      // Sem permissão não adianta tentar de novo.
      retry: (failureCount, error) => !isAdminPermissionError(error) && failureCount < 3,
    },
  },
});
