import { useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useAuthStore } from "../../../store/use-auth-store";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { AuthCard, AuthMessage } from "./auth-card";

interface ForgotPasswordPageProps {
  onGoBack: () => void;
}

export function ForgotPasswordPage({ onGoBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const forgotPassword = useAuthStore((state) => state.forgotPassword);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isLoading) return;
    setSuccessMessage(null);
    const result = await forgotPassword(email);
    if (result.success) {
      setSuccessMessage("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
    }
  };

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Informe o e-mail do seu acesso e enviaremos um link para criar uma nova senha."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        {successMessage && <AuthMessage tone="success">{successMessage}</AuthMessage>}

        <div className="space-y-2">
          <label htmlFor="forgot-email" className="text-[13px] font-bold text-(--text-main)">
            E-mail
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl pl-10 text-[14px] font-medium"
              required
            />
          </div>
        </div>

        <Button type="submit" size="lg" disabled={!email || isLoading} className="w-full">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Enviando..." : "Enviar link de recuperação"}
        </Button>

        <Button variant="ghost" onClick={onGoBack} className="w-full">
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Button>
      </form>
    </AuthCard>
  );
}
