import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type {
  NamedItem,
  PlanAction,
  PlanDoc,
  PlanPillar,
  PlanPriority,
  StageId,
  StageItem,
} from "../../../types/tracking";

interface PlanDocumentProps {
  plan: PlanDoc;
  pillars: NamedItem[];
  stages: StageItem[];
}

// Quando não há nota, a barra mostra o meio da faixa do estágio.
const STAGE_FALLBACK_SCORE: Record<StageId, number> = {
  reativo: 1.5,
  em_organizacao: 4,
  estruturado: 6.2,
  gerencial: 8.7,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-extrabold text-(--text-main) sm:text-2xl">{children}</h2>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-(--primary-text)">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-(--text-main)">{children}</dd>
    </div>
  );
}

function PillarCard({ pillar, name, stages }: { pillar: PlanPillar; name: string; stages: StageItem[] }) {
  const stage = stages.find((item) => item.id === pillar.stage);
  const score =
    pillar.score !== null && pillar.score !== ""
      ? Number(pillar.score)
      : pillar.stage
        ? STAGE_FALLBACK_SCORE[pillar.stage]
        : 0;

  return (
    <Card className="g360-print-avoid-break">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-(--text-main)">{name}</h3>
        {/* O estágio é a informação principal; a barra é só apoio visual. */}
        <span className="rounded-full bg-(--primary) px-3 py-1 text-xs font-bold text-white">
          {stage?.name || "Sem estágio"}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-3 h-2 overflow-hidden rounded-full bg-(--bg-surface-muted)"
      >
        <div className="h-full rounded-full bg-(--primary)" style={{ width: `${score * 10}%` }} />
      </div>
      <dl className="mt-4 space-y-3">
        <Labeled label="O que já existe">{pillar.exists}</Labeled>
        <Labeled label="Ponto de atenção">{pillar.attention}</Labeled>
        <Labeled label="O que isso exige agora">{pillar.requires}</Labeled>
      </dl>
    </Card>
  );
}

function PriorityCard({ label, priority }: { label: string; priority: PlanPriority }) {
  return (
    <Card className="g360-print-avoid-break">
      <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">{label}</p>
      <h3 className="mt-1 text-lg font-bold text-(--text-main)">{priority.name}</h3>
      <dl className="mt-4 space-y-3">
        <Labeled label="Por que vem primeiro">{priority.why}</Labeled>
        <Labeled label="O que está bloqueando">{priority.blocks}</Labeled>
        <Labeled label="O que muda quando for resolvida">{priority.changes}</Labeled>
      </dl>
    </Card>
  );
}

export function ActionDetails({ action }: { action: PlanAction }) {
  return (
    <dl className="space-y-3">
      <Labeled label="Por que fazer">{action.why}</Labeled>
      {action.steps.length > 0 && (
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-(--primary-text)">Como fazer</dt>
          <dd className="mt-1">
            <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-(--text-main)">
              {action.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </dd>
        </div>
      )}
      {action.indicators.length > 0 && (
        <Labeled label="Indicadores">{action.indicators.join(" · ")}</Labeled>
      )}
      <Labeled label="Considere concluída quando">{action.doneCriteria}</Labeled>
      <Labeled label="Conteúdo recomendado">{action.content}</Labeled>
      <Labeled label="Recurso de apoio">{action.resource}</Labeled>
      <Labeled label="CRM (opcional)">{action.crm}</Labeled>
    </dl>
  );
}

/**
 * O documento que o cliente recebe, na ordem da arquitetura aprovada:
 * Identificação, Seu Diagnóstico 360°, Sua Direção, Seu Plano de Ação, Sua
 * Rota de Desenvolvimento, Rotina de autogestão e Seu Próximo Passo.
 * Plano de Ação e Rota de Desenvolvimento só chegam para o Premium.
 */
export function PlanDocument({ plan, pillars, stages }: PlanDocumentProps) {
  const { identification, diagnosis, direction, actions, development, nextStep } = plan.content;
  const route = [
    { label: "Agora", text: direction.route.now },
    { label: "Depois", text: direction.route.next },
    { label: "Na sequência", text: direction.route.later },
  ].filter((item) => item.text);
  const hasDevelopment = development.ceo.length > 0 || development.team.length > 0;

  return (
    <div className="space-y-12">
      <Card className="flex flex-wrap gap-x-10 gap-y-3">
        {[
          { label: "Empresa", value: identification.company },
          { label: "Empresário", value: identification.owner },
          { label: "Segmento", value: identification.segment },
          { label: "Cidade/UF", value: identification.city },
          { label: "Data do diagnóstico", value: formatDate(plan.approvedAt) },
        ]
          .filter((item) => item.value)
          .map((item) => (
            <div key={item.label}>
              <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-(--text-main)">{item.value}</p>
            </div>
          ))}
      </Card>

      <section className="space-y-5">
        <SectionTitle>Seu Diagnóstico 360°</SectionTitle>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-(--text-main)">
          {diagnosis.reading}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {diagnosis.pillars.map((pillar) => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              name={pillars.find((item) => item.id === pillar.id)?.name || pillar.id}
              stages={stages}
            />
          ))}
        </div>
        {diagnosis.synthesis && (
          <div className="rounded-2xl border-l-4 border-(--primary) bg-(--bg-surface) p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-(--primary-text)">
              Síntese diagnóstica
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-(--text-main)">
              {diagnosis.synthesis}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionTitle>Sua Direção</SectionTitle>
        <div className={cn("grid gap-4", direction.complementary && "lg:grid-cols-2")}>
          <PriorityCard label="Prioridade principal" priority={direction.main} />
          {direction.complementary && (
            <PriorityCard label="Prioridade complementar" priority={direction.complementary} />
          )}
        </div>
        {route.length > 0 && (
          <ol className="grid gap-3 md:grid-cols-3">
            {route.map((item, index) => (
              <li
                key={item.label}
                className="g360-print-avoid-break rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5"
              >
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--primary-text)">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-(--primary) text-white">
                    {index + 1}
                  </span>
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-(--text-main)">{item.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {actions.length > 0 && (
        <section className="space-y-5">
          <SectionTitle>Seu Plano de Ação</SectionTitle>
          {actions.map((action, index) => (
            <Card key={action.id} className="g360-print-avoid-break">
              <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                Ação {index + 1}
              </p>
              <h3 className="mb-4 mt-1 text-lg font-bold text-(--text-main)">{action.title}</h3>
              <ActionDetails action={action} />
            </Card>
          ))}

          <Card className="g360-print-avoid-break">
            <h3 className="text-base font-bold text-(--text-main)">Rotina de autogestão</h3>
            <dl className="mt-3 space-y-3">
              <Labeled label="Toda semana">
                Revise a ação ativa, olhe os indicadores relacionados e defina o próximo passo de
                execução.
              </Labeled>
              <Labeled label="Todo mês">
                Faça o check-in 360°, reconheça o avanço, identifique o bloqueio principal e decida
                se continua, ajusta ou retoma a ação.
              </Labeled>
            </dl>
          </Card>
        </section>
      )}

      {hasDevelopment && (
        <section className="space-y-5">
          <SectionTitle>Sua Rota de Desenvolvimento</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: "Para você, empresário", source: "Formação Executiva", items: development.ceo },
              { title: "Para o seu time", source: "Academy", items: development.team },
            ]
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <Card key={group.title} className="g360-print-avoid-break">
                  <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                    {group.source}
                  </p>
                  <h3 className="mt-1 text-base font-bold text-(--text-main)">{group.title}</h3>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-(--text-main)">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-text)" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
          </div>
        </section>
      )}

      <section className="g360-print-avoid-break rounded-3xl bg-(--primary) p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">Seu próximo passo</p>
        <h2 className="mt-2 text-xl font-extrabold sm:text-2xl">{nextStep.action}</h2>
        {nextStep.why && <p className="mt-3 text-sm leading-relaxed">{nextStep.why}</p>}
        {nextStep.steps.length > 0 && (
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            {nextStep.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-sm leading-relaxed">
          <strong>Considere concluído quando:</strong> {nextStep.doneCriteria}
        </p>
        {nextStep.after && (
          <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Depois:</strong> {nextStep.after}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
