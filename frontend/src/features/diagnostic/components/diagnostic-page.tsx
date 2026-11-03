import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { useAuthStore } from "../../../store/use-auth-store";
import { useMarkPlanSeenMutation, usePlanQuery } from "../../plan/hooks/use-plan-query";
import { PlanDocument } from "../../plan/components/plan-document";
import { ReviewNotice } from "../../plan/components/review-notice";
import { useDiagnosticQuery } from "../hooks/use-diagnostic-query";
import { DiagnosticAnswers } from "./diagnostic-answers";

interface DiagnosticPageProps {
  onOpenPremium: () => void;
}

/**
 * Diagnóstico 360°: o documento liberado pela equipe. Enquanto a revisão não
 * termina, a pessoa vê o prazo e as respostas que enviou.
 */
export function DiagnosticPage({ onOpenPremium }: DiagnosticPageProps) {
  const isPremium = useAuthStore((state) => state.user?.plan === "premium");
  const planQuery = usePlanQuery();
  const diagnosticQuery = useDiagnosticQuery();
  const data = planQuery.data;

  // Ao abrir, marca o plano liberado como visto: o aviso "Novo" some da barra e da Início.
  const markSeen = useMarkPlanSeenMutation();
  const seenRef = useRef(false);
  useEffect(() => {
    if (data?.planUnseen && !seenRef.current) {
      seenRef.current = true;
      markSeen.mutate();
    }
  }, [data?.planUnseen, markSeen]);

  return (
    <Page
      title="Diagnóstico 360°"
      subtitle="A leitura do momento da sua empresa, a prioridade que vem primeiro e o seu próximo passo."
      actions={
        data?.plan && (
          // O navegador gera o PDF: na janela que abre, escolha "Salvar como PDF".
          <Button variant="secondary" onClick={() => window.print()} className="g360-no-print">
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
        )
      }
    >
      <QueryState
        isPending={planQuery.isPending}
        isError={planQuery.isError}
        onRetry={() => void planQuery.refetch()}
        errorMessage="Não foi possível carregar o seu diagnóstico."
      />

      {data && (
        <div className="space-y-8">
          {data.review && <ReviewNotice review={data.review} firstCycle={!data.plan} />}

          {data.plan ? (
            <>
              <PlanDocument plan={data.plan} pillars={data.pillars} stages={data.stages} />

              {!isPremium && (
                <Card className="g360-no-print flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-(--text-main)">
                      Quer o Plano de Ação completo?
                    </h2>
                    <p className="mt-1 max-w-xl text-sm text-(--text-muted)">
                      Na Assinatura Anual este diagnóstico vira um plano com ações detalhadas, indicadores,
                      critérios de conclusão e a rota de conteúdos para você e o seu time.
                    </p>
                  </div>
                  <Button onClick={onOpenPremium}>Conhecer a Assinatura Anual</Button>
                </Card>
              )}
            </>
          ) : (
            <>
              {!data.review && (
                <EmptyState>Seu diagnóstico aparece aqui depois que você enviar a anamnese.</EmptyState>
              )}
              {diagnosticQuery.data?.diagnostic && (
                <Card>
                  <h2 className="mb-5 text-lg font-bold text-(--text-main)">Suas respostas</h2>
                  <DiagnosticAnswers
                    questions={diagnosticQuery.data.questions}
                    answers={diagnosticQuery.data.diagnostic.answers}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
