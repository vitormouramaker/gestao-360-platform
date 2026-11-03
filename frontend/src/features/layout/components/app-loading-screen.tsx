import { Loader2 } from "lucide-react";
import { Logo360 } from "../../../components/brand/logo-360";

/** Tela cheia exibida enquanto o app descobre a API e carrega a sessão. */
export function AppLoadingScreen() {
  return (
    <div
      className="g360-auth-screen grid min-h-dvh place-items-center p-6 text-(--text-main)"
      role="status"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-5">
        <Logo360 className="w-52" />
        <Loader2 className="h-5 w-5 animate-spin text-(--primary)" />
      </div>
    </div>
  );
}
