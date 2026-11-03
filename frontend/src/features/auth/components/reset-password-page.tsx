import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuthStore } from "../../../store/use-auth-store";
import { PasswordInput } from "../../../components/ui/password-input";
import { Button } from "../../../components/ui/button";
import { AuthCard, AuthMessage } from "./auth-card";

interface ResetPasswordPageProps {
  onGoBack: () => void;
  /** setup = primeiro acesso, vindo do e-mail de boas-vindas. */
  mode?: "reset" | "setup";
  /** Token já resolvido (link curto /acesso/...); sem ele, vem do endereço. */
  token?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage({ onGoBack, mode = "reset", token: givenToken }: ResetPasswordPageProps) {
  const isSetup = mode === "setup";
  const [token] = useState(
    () => givenToken || new URLSearchParams(window.location.search).get("token") || "",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resetPassword = useAuthStore((state) => state.resetPassword);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setLocalError("As senhas não conferem.");
      return;
    }

    setLocalError(null);
    const result = await resetPassword(token, password);
    if (result.success) setDone(true);
  };

  if (!token) {
    return (
      <AuthCard
        title="Link inválido"
        subtitle={
          isSetup
            ? 'Este link não é válido ou já expirou. Na tela de login, use "Esqueceu a senha?" com o e-mail da compra.'
            : "Este link de redefinição não é válido ou já expirou."
        }
      >
        <Button onClick={onGoBack} size="lg" className="w-full">
          Voltar para o login
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title={isSetup ? "Senha criada" : "Senha redefinida"}
        subtitle={
          isSetup
            ? "Agora é só entrar com o seu e-mail e a senha que você acabou de criar."
            : "Sua nova senha já está valendo."
        }
      >
        <Button onClick={onGoBack} size="lg" className="w-full">
          Entrar na plataforma
        </Button>
      </AuthCard>
    );
  }

  const mensagemDeErro = localError || error;

  return (
    <AuthCard
      title={isSetup ? "Crie a sua senha" : "Criar nova senha"}
      subtitle={
        isSetup
          ? "Bem-vindo ao Gestão 360°. Escolha uma senha com pelo menos 8 caracteres para o seu primeiro acesso."
          : "Escolha uma senha com pelo menos 8 caracteres."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {mensagemDeErro && <AuthMessage tone="error">{mensagemDeErro}</AuthMessage>}

        <div className="space-y-2">
          <label htmlFor="reset-password" className="text-[13px] font-bold text-(--text-main)">
            {isSetup ? "Senha" : "Nova senha"}
          </label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reset-confirmation" className="text-[13px] font-bold text-(--text-main)">
            {isSetup ? "Confirmar senha" : "Confirmar nova senha"}
          </label>
          <PasswordInput
            id="reset-confirmation"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
          />
        </div>

        <Button type="submit" size="lg" disabled={!password || !confirmation || isLoading} className="w-full">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Salvando..." : isSetup ? "Criar senha e continuar" : "Salvar nova senha"}
        </Button>

        <Button variant="ghost" onClick={onGoBack} className="w-full">
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Button>
      </form>
    </AuthCard>
  );
}
