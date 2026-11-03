import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { PlanDocument } from "../../plan/components/plan-document";
import type { NamedItem, PlanDoc, StageItem } from "../../../types/tracking";

interface PlanPreviewOverlayProps {
  plan: PlanDoc;
  pillars: NamedItem[];
  stages: StageItem[];
  /** Texto do topo: "Visualização do aluno" ou "Documento completo". */
  title: string;
  subtitle?: string;
  onClose: () => void;
}

/**
 * Sobreposição em tela cheia com o plano renderizado igual ao que o aluno vê
 * (componente PlanDocument). Serve para a equipe conferir a visão do aluno e
 * exportar o PDF: no "Exportar PDF", só este documento vai para o papel (a
 * regra g360-printing-plan em index.css esconde o resto).
 */
export function PlanPreviewOverlay({ plan, pillars, stages, title, subtitle, onClose }: PlanPreviewOverlayProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Trava a rolagem do fundo enquanto a sobreposição está aberta.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const exportPdf = () => {
    document.documentElement.classList.add("g360-printing-plan");
    const cleanup = () => {
      document.documentElement.classList.remove("g360-printing-plan");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    // Rede de segurança caso o afterprint não dispare (alguns navegadores).
    window.setTimeout(cleanup, 2000);
    window.print();
  };

  return createPortal(
    <div className="g360-plan-print fixed inset-0 z-50 overflow-auto bg-(--bg-app)">
      <div className="g360-no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-(--border-subtle) bg-(--bg-surface) px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-bold text-(--text-main)">{title}</p>
          {subtitle && <p className="text-xs text-(--text-muted)">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={exportPdf}>
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        <PlanDocument plan={plan} pillars={pillars} stages={stages} />
      </div>
    </div>,
    document.body,
  );
}
