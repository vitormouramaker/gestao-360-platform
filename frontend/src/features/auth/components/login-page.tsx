import { useState } from "react";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { useAuthStore } from "../../../store/use-auth-store";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { PasswordInput } from "../../../components/ui/password-input";
import { AuthCard, AuthMessage } from "./auth-card";

interface LoginPageProps {
  onGoToForgot: () => void;
}

const REMEMBERED_EMAIL_KEY = "go_x_360_remembered_email";

export function LoginPage({ onGoToForgot }: LoginPageProps) {
  const [email, setEmail] = useState(
    () => localStorage.getItem(REMEMBERED_EMAIL_KEY) || "",
  );
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(
    () => !!localStorage.getItem(REMEMBERED_EMAIL_KEY),
  );

  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;
    const success = await login(email, password);
    if (!success) return;

    if (rememberEmail) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  };

  return (
    <AuthCard
      title="Bem-vindo de volta"
      subtitle="Entre para acessar os entregáveis do seu plano."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-[13px] font-bold text-(--text-main)">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
              <Input
                id="login-email"
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

          <div className="space-y-2">
            <label htmlFor="login-password" className="text-[13px] font-bold text-(--text-main)">
              Senha
            </label>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-medium text-(--text-muted)">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="h-4 w-4 rounded border border-(--border-strong) accent-(--primary)"
                />
                Lembrar e-mail
              </label>
              <button
                type="button"
                onClick={onGoToForgot}
                className="cursor-pointer text-[12px] font-bold text-(--primary-text) transition-colors hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={!email || !password || isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            <>
              Entrar na plataforma
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-8 text-center text-[12px] font-medium text-(--text-muted)">
        O acesso é liberado após a compra do Gestão 360°.
      </p>
    </AuthCard>
  );
}
