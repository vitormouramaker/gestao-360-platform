import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getErrorMessage } from "../../../lib/http";
import { AuthCard } from "./auth-card";
import { ResetPasswordPage } from "./reset-password-page";

interface AccessLinkPageProps {
  code: string;
  onGoBack: () => void;
}

/**
 * Link curto de primeiro acesso (/acesso/CODIGO): troca o código pelo token e
 * abre a tela de criar a senha. O endereço continua curto na barra.
 */
export function AccessLinkPage({ code, onGoBack }: AccessLinkPageProps) {
  const [state, setState] = useState<{ token?: string; error?: string }>({});

  useEffect(() => {
    let active = true;
    axios
      .get<{ token: string }>(`/api/auth/access-link/${encodeURIComponent(code)}`)
      .then((response) => active && setState({ token: response.data.token }))
      .catch((error) => active && setState({ error: getErrorMessage(error, "Este link não é válido ou já expirou.") }));
    return () => {
      active = false;
    };
  }, [code]);

  if (state.token) return <ResetPasswordPage mode="setup" token={state.token} onGoBack={onGoBack} />;

  if (state.error) {
    return (
      <AuthCard title="Link indisponível" subtitle={state.error}>
        <Button onClick={onGoBack} size="lg" className="w-full">
          Ir para o login
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Abrindo o seu acesso" subtitle="Só um instante.">
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    </AuthCard>
  );
}
