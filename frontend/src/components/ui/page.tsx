import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

interface PageProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Botões à direita do título. */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Moldura padrão de uma tela: título, subtítulo, ações e conteúdo. */
export function Page({ title, subtitle, actions, className, children }: PageProps) {
  return (
    <div className={cn("w-full px-4 py-8 sm:px-8 2xl:px-12", className)}>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-(--text-main) sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-3xl text-sm font-medium text-(--text-muted)">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6", className)}>
      {children}
    </div>
  );
}

/** Carregando / erro com "tentar novamente" para telas que dependem de uma consulta. */
export function QueryState({
  isPending,
  isError,
  onRetry,
  errorMessage = "Não foi possível carregar os dados.",
}: {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  errorMessage?: string;
}) {
  if (isPending) {
    return (
      <div role="status" className="flex items-center gap-3 py-10 text-sm font-medium text-(--text-muted)">
        <Loader2 className="h-5 w-5 animate-spin text-(--primary)" />
        Carregando...
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <p role="alert" className="text-sm font-medium text-(--text-main)">
          {errorMessage}
        </p>
        <Button className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  return null;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-(--border-strong) p-6 text-sm font-medium text-(--text-muted)">
      {children}
    </p>
  );
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} de ${total} concluídos`}
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-(--bg-surface-muted)"
      >
        <div className="h-full rounded-full bg-(--primary) transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums text-(--text-muted)">
        {done}/{total}
      </span>
    </div>
  );
}
