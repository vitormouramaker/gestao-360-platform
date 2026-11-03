import { Logo360 } from "../../../components/brand/logo-360";
import { LegalLinks } from "../../legal/components/legal-page";

interface AuthCardProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/** Moldura das telas de acesso (login, esqueci a senha, nova senha). */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="g360-auth-screen flex min-h-dvh items-center justify-center p-4 py-10">
      <div className="g360-auth-card w-full max-w-105 rounded-3xl border p-8">
        <div className="mb-8 text-center">
          <Logo360 className="mx-auto mb-5 w-48 text-(--text-main)" />
          <h1 className="text-2xl font-extrabold tracking-tight text-(--text-main)">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm font-medium text-(--text-muted)">{subtitle}</p>
          )}
        </div>
        {children}
        <LegalLinks className="mt-6 text-center text-xs font-medium text-(--text-muted)" />
      </div>
    </div>
  );
}

export function AuthMessage({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-xl border border-rose-300 bg-rose-50 p-3 text-center text-[13px] font-bold text-rose-700"
          : "rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center text-[13px] font-bold text-emerald-800"
      }
    >
      {children}
    </div>
  );
}
