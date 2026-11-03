import axios from "axios";

/**
 * Recusa do servidor por falta de permissão em uma área do /adm (403 com
 * code "ADMIN_PERMISSION"). Não é sessão expirada: a pessoa continua logada.
 */
export function isAdminPermissionError(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 403 &&
    (error.response.data as { code?: string } | undefined)?.code === "ADMIN_PERMISSION"
  );
}

export function adminPermissionMessage(error: unknown) {
  const message = axios.isAxiosError(error)
    ? (error.response?.data as { message?: string } | undefined)?.message
    : undefined;
  return message || "Você não tem permissão para esta área. Fale com o administrador master.";
}
