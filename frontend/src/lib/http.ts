import axios from "axios";
import { useAuthStore } from "../store/use-auth-store";

/** Cabeçalho de autenticação para as chamadas à API. */
export function authConfig() {
  return { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } };
}

/** Mensagem que a API devolveu no erro, ou a alternativa informada. */
export function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (!error.response) return "Não foi possível falar com o servidor.";
  }
  return fallback;
}
