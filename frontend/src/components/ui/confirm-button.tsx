import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { cn } from "../../lib/utils";

interface ConfirmButtonProps {
  /** Para leitores de tela: o que será excluído. */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const CONFIRM_WINDOW_MS = 4000;

/**
 * Excluir em dois cliques: o primeiro arma ("Confirmar?"), o segundo executa.
 * Se a pessoa não confirmar em alguns segundos, volta ao normal.
 */
export function ConfirmButton({ label, onConfirm, disabled }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={armed ? `Confirmar exclusão: ${label}` : `Excluir: ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors disabled:pointer-events-none disabled:opacity-50",
        armed
          ? "bg-rose-600 text-white hover:bg-rose-700"
          : "text-(--text-muted) hover:bg-(--bg-surface-muted) hover:text-rose-600",
      )}
    >
      <Trash2 className="h-4 w-4" />
      {armed && "Confirmar?"}
    </button>
  );
}
