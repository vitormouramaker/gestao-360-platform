import { Clock } from "lucide-react";
import { Card } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import type { PlanReview } from "../../../types/tracking";

interface ReviewNoticeProps {
  review: PlanReview;
  /** Primeiro diagnóstico ou o plano de um novo ciclo. */
  firstCycle: boolean;
}

/** Aviso de que o diagnóstico (ou o novo plano) está com a equipe para revisão. */
export function ReviewNotice({ review, firstCycle }: ReviewNoticeProps) {
  return (
    <Card className="g360-no-print flex items-start gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--primary)/12 text-(--primary-text)">
        <Clock className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-lg font-bold text-(--text-main)">
          {firstCycle ? "Seu diagnóstico está em análise" : "Seu novo plano está em análise"}
        </h2>
        <p className="mt-1 text-sm text-(--text-muted)">
          {firstCycle
            ? "Recebemos a sua anamnese."
            : "Recebemos o seu pedido e estamos olhando o que você executou no plano anterior."}{" "}
          Nosso time analisa e devolve em até 72 horas úteis, com previsão para{" "}
          <strong className="text-(--text-main)">{formatDate(review.dueAt)}</strong>. O resultado
          aparece aqui assim que for liberado.
        </p>
      </div>
    </Card>
  );
}
