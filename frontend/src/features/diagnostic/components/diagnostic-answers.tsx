import type { Answers, DiagnosticQuestion } from "../../../types/tracking";

interface DiagnosticAnswersProps {
  questions: DiagnosticQuestion[];
  answers: Answers;
}

function formatAnswer(question: DiagnosticQuestion, value: Answers[string] | undefined) {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return "Sem resposta";
  }
  if (Array.isArray(value)) return value.join(", ");
  // "Não sei informar" / "Não possuo meta definida": mostra como foi escolhido.
  if (question.emptyOption && value === question.emptyOption) return value;
  if (question.type === "moeda") return `R$ ${value}`;
  if (question.type === "percentual") return `${value}%`;
  return value;
}

/** Respostas da anamnese agrupadas por seção. */
export function DiagnosticAnswers({ questions, answers }: DiagnosticAnswersProps) {
  const sections = [...new Set(questions.map((question) => question.section))];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section}>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-(--primary-text)">
            {section}
          </h3>
          <dl className="mt-3 space-y-4">
            {questions
              .filter((question) => question.section === section)
              .map((question) => (
                <div key={question.id}>
                  <dt className="text-[13px] font-bold text-(--text-main)">
                    {question.number}. {question.label}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-(--text-muted)">
                    {formatAnswer(question, answers[question.id])}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
