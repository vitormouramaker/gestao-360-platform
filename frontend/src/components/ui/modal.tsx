import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useFecharComEsc } from "../../lib/use-fechar-com-esc";
import { cn } from "../../lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Botões do rodapé (ficam sempre à vista). */
  footer?: React.ReactNode;
  className?: string;
}

/** Janela padrão dos formulários. Fecha com Esc, no X ou clicando fora. */
export function Modal({ open, title, onClose, children, footer, className }: ModalProps) {
  const titleId = useId();
  useFecharComEsc(open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="g360-theme-overlay fixed inset-0 z-[80] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "g360-modal-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-(--border-subtle) bg-(--bg-elevated) text-(--text-main) shadow-(--shadow-elevated) sm:rounded-3xl",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-(--border-subtle) px-6 py-4">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-(--border-subtle) px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
