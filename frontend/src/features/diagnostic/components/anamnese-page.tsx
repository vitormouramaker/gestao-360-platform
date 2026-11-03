import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, ArrowRight, Check, Loader2, LogOut, Send } from "lucide-react";
import { Logo360 } from "../../../components/brand/logo-360";
import { Button } from "../../../components/ui/button";
import { CityUfField, parseCityUf } from "../../../components/ui/city-uf-field";
import { Field, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { formatPhone } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import type { Answers, AnswerValue, Diagnostic, DiagnosticQuestion } from "../../../types/tracking";
import { diagnosticQueryKey, type DiagnosticResponse } from "../hooks/use-diagnostic-query";

interface AnamnesePageProps {
  questions: DiagnosticQuestion[];
  /** Rascunho já salvo, se a pessoa começou antes. */
  draft: Diagnostic | null;
  /** Chamado quando o envio dá certo, para a plataforma confirmar o recebimento. */
  onSubmitted?: () => void;
}

// Espera a pessoa parar de digitar antes de salvar o rascunho.
const AUTOSAVE_DELAY_MS = 1200;

// Pergunta "Cidade/UF" da Matriz: continua um texto só ("Teresina/PI"), mas é
// respondida em dois seletores. Os ids da Matriz não mudam.
const CITY_QUESTION_ID = "q04";

function isAnswered(question: DiagnosticQuestion, value: AnswerValue | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value?.trim()) return false;
  // WhatsApp precisa do DDD: de 10 a 13 dígitos.
  if (question.type === "phone") {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 10 && digits <= 13;
  }
  if (question.id === CITY_QUESTION_ID) {
    const { city, uf } = parseCityUf(value);
    return Boolean(uf && city.trim());
  }
  return true;
}

const optionClass = (selected: boolean) =>
  cn(
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--primary)",
    selected
      ? "border-(--primary) bg-(--primary)/12 text-(--primary-text)"
      : "border-(--border-strong) text-(--text-main) hover:bg-(--bg-surface-muted)",
  );

// Perguntas por tela: poucas, para caber sem rolagem longa. As de marcar opção
// ocupam mais altura que as de digitar.
const CHOICE_QUESTIONS_PER_PAGE = 2;
const TEXT_QUESTIONS_PER_PAGE = 3;

type AnamnesePageStep = { section: string; questions: DiagnosticQuestion[] };

/** Quebra cada bloco da Matriz em telas curtas, mantendo a ordem das perguntas. */
function buildPages(questions: DiagnosticQuestion[]): AnamnesePageStep[] {
  const pages: AnamnesePageStep[] = [];
  for (const question of questions) {
    const isChoice = question.type === "select" || question.type === "multi";
    const last = pages[pages.length - 1];
    const lastIsChoice = last?.questions.some((item) => item.type === "select" || item.type === "multi");
    const limit = isChoice || lastIsChoice ? CHOICE_QUESTIONS_PER_PAGE : TEXT_QUESTIONS_PER_PAGE;
    if (last && last.section === question.section && last.questions.length < limit) {
      last.questions.push(question);
    } else {
      pages.push({ section: question.section, questions: [question] });
    }
  }
  return pages;
}

/**
 * Anamnese em tela cheia: é o primeiro passo de quem acabou de entrar. Poucas
 * perguntas por tela, com rascunho salvo sozinho para a pessoa poder parar e voltar.
 */
export function AnamnesePage({ questions, draft, onSubmitted }: AnamnesePageProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  const pages = useMemo(() => buildPages(questions), [questions]);
  const [answers, setAnswers] = useState<Answers>(() => draft?.answers || {});
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">(
    draft ? "saved" : "idle",
  );
  // Só salva depois de alguma mudança feita nesta visita.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) return;

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      axios
        .put("/api/diagnostic/draft", { answers }, authConfig())
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("failed"));
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [answers]);

  const submit = useMutation({
    mutationFn: async () =>
      (await axios.post<{ diagnostic: Diagnostic }>("/api/diagnostic", { answers }, authConfig())).data,
    onSuccess: (data) => {
      dirtyRef.current = false;
      // Com a anamnese enviada, a plataforma se abre.
      queryClient.setQueryData<DiagnosticResponse>(diagnosticQueryKey(user?.id), (current) =>
        current ? { ...current, diagnostic: data.diagnostic } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
      onSubmitted?.();
    },
    onError: (submitError) =>
      setError(getErrorMessage(submitError, "Não foi possível enviar a anamnese.")),
  });

  const setAnswer = (id: string, value: AnswerValue) => {
    dirtyRef.current = true;
    setError(null);
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  /** Marca ou desmarca uma opção de múltipla escolha, respeitando a opção exclusiva. */
  const toggleOption = (question: DiagnosticQuestion, option: string) => {
    const selected = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : [];
    if (selected.includes(option)) {
      setAnswer(question.id, selected.filter((item) => item !== option));
    } else if (option === question.exclusiveOption) {
      setAnswer(question.id, [option]);
    } else {
      setAnswer(question.id, [...selected.filter((item) => item !== question.exclusiveOption), option]);
    }
  };

  const sectionQuestions = pages[step]?.questions ?? [];
  const required = questions.filter((question) => !question.optional);
  const answeredCount = required.filter((question) => isAnswered(question, answers[question.id])).length;
  const isLastStep = step === pages.length - 1;

  /** Primeira pergunta obrigatória sem resposta válida entre as informadas. */
  const findMissing = (list: DiagnosticQuestion[]) =>
    list.find((question) => !question.optional && !isAnswered(question, answers[question.id]));

  const focusQuestion = (question: DiagnosticQuestion) => {
    const value = answers[question.id];
    const typed = typeof value === "string" && value.trim();
    setError(
      question.type === "phone" && typed
        ? "Informe o WhatsApp com DDD."
        : question.id === CITY_QUESTION_ID
          ? "Escolha a UF e a cidade."
          : `Responda: ${question.label}`,
    );
    window.setTimeout(() => document.getElementById(`anamnese-${question.id}`)?.focus(), 50);
  };

  const goToStep = (next: number) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!isLastStep) {
      const missing = findMissing(sectionQuestions);
      if (missing) {
        focusQuestion(missing);
        return;
      }
      goToStep(step + 1);
      return;
    }

    const missing = findMissing(questions);
    if (missing) {
      setStep(pages.findIndex((page) => page.questions.includes(missing)));
      focusQuestion(missing);
      return;
    }
    submit.mutate();
  };

  return (
    <div className="g360-auth-screen min-h-dvh px-4 py-8 text-(--text-main) sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <Logo360 className="w-36" />
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>

        <header className="mt-8">
          <h1 className="text-2xl font-extrabold sm:text-3xl">
            {user?.name ? `${user.name.split(" ")[0]}, vamos conhecer a sua empresa` : "Vamos conhecer a sua empresa"}
          </h1>
          {step === 0 && (
            <p className="mt-2 text-sm font-medium text-(--text-muted) sm:text-base">
              Esta anamnese é o ponto de partida do seu Diagnóstico 360°. Leva de 10 a 12 minutos.
              Responda com o que acontece hoje na empresa: se não souber um número, marque "Não sei".
              Isso também é uma informação.
            </p>
          )}
        </header>

        <div className="mt-6">
          <div className="flex items-center justify-between text-xs font-bold text-(--text-muted)">
            <span>
              Etapa {step + 1} de {pages.length}
            </span>
            <span aria-live="polite">
              {saveState === "saving" && "Salvando rascunho..."}
              {saveState === "saved" && "Rascunho salvo"}
              {saveState === "failed" && "Não deu para salvar o rascunho"}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={required.length}
            aria-valuenow={answeredCount}
            aria-label={`${answeredCount} de ${required.length} perguntas respondidas`}
            className="mt-2 h-2 overflow-hidden rounded-full bg-(--bg-surface-muted)"
          >
            <div
              className="h-full rounded-full bg-(--primary) transition-[width]"
              style={{ width: `${(answeredCount / Math.max(required.length, 1)) * 100}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6">
          <section className="g360-auth-card rounded-3xl border p-6 sm:p-8">
            <h2 className="text-lg font-bold">{pages[step]?.section}</h2>

            <div className="mt-6 space-y-7">
              {sectionQuestions.map((question) => {
                const fieldId = `anamnese-${question.id}`;
                const value = answers[question.id];
                const label = question.optional ? `${question.label} (opcional)` : question.label;

                if (question.type === "select" || question.type === "multi") {
                  const multiple = question.type === "multi";
                  const selected = Array.isArray(value) ? value : [];

                  return (
                    <fieldset key={question.id}>
                      <legend className="text-sm font-bold">{label}</legend>
                      {multiple && (
                        <p className="mt-1 text-xs font-medium text-(--text-muted)">
                          Marque todos que se aplicam.
                        </p>
                      )}
                      <div className="mt-3 space-y-2">
                        {question.options?.map((option, index) => {
                          const checked = multiple ? selected.includes(option) : value === option;
                          return (
                            <label key={option} className={optionClass(checked)}>
                              <input
                                id={index === 0 ? fieldId : undefined}
                                type={multiple ? "checkbox" : "radio"}
                                name={question.id}
                                value={option}
                                checked={checked}
                                onChange={() =>
                                  multiple ? toggleOption(question, option) : setAnswer(question.id, option)
                                }
                                className="sr-only"
                              />
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "grid h-5 w-5 shrink-0 place-items-center border-2",
                                  multiple ? "rounded-md" : "rounded-full",
                                  checked
                                    ? "border-(--primary) bg-(--primary) text-white"
                                    : "border-(--border-strong)",
                                )}
                              >
                                {checked && <Check className="h-3 w-3" strokeWidth={4} />}
                              </span>
                              {option}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                }

                const textValue = typeof value === "string" ? value : "";
                const isIndicator = question.type === "moeda" || question.type === "percentual";
                const isEmptyOption = question.emptyOption != null && textValue === question.emptyOption;
                return (
                  <Field key={question.id} label={label} htmlFor={fieldId} className="[&>label]:text-sm">
                    {question.id === CITY_QUESTION_ID ? (
                      <CityUfField
                        id={fieldId}
                        value={textValue}
                        onChange={(next) => setAnswer(question.id, next)}
                        className="h-11"
                      />
                    ) : isIndicator ? (
                      <div className="space-y-2">
                        <div className="relative">
                          {question.type === "moeda" && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--text-muted)">
                              R$
                            </span>
                          )}
                          <Input
                            id={fieldId}
                            type="text"
                            inputMode="decimal"
                            disabled={isEmptyOption}
                            value={isEmptyOption ? "" : textValue}
                            maxLength={20}
                            placeholder={question.type === "moeda" ? "0,00" : "0"}
                            onChange={(event) =>
                              setAnswer(question.id, event.target.value.replace(/[^\d.,]/g, ""))
                            }
                            className={cn("h-11", question.type === "moeda" ? "pl-9" : "pr-8")}
                          />
                          {question.type === "percentual" && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-(--text-muted)">
                              %
                            </span>
                          )}
                        </div>
                        {question.emptyOption && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-muted)">
                            <input
                              type="checkbox"
                              checked={isEmptyOption}
                              onChange={(event) =>
                                setAnswer(question.id, event.target.checked ? question.emptyOption! : "")
                              }
                              className="h-4 w-4 accent-(--primary)"
                            />
                            {question.emptyOption}
                          </label>
                        )}
                      </div>
                    ) : question.type === "textarea" ? (
                      <Textarea
                        id={fieldId}
                        value={textValue}
                        maxLength={2000}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                      />
                    ) : (
                      <Input
                        id={fieldId}
                        type={question.type === "phone" ? "tel" : "text"}
                        inputMode={question.type === "phone" ? "tel" : undefined}
                        autoComplete={question.type === "phone" ? "tel-national" : undefined}
                        placeholder={question.type === "phone" ? "(11) 99999-9999" : undefined}
                        value={textValue}
                        maxLength={question.type === "phone" ? 30 : 200}
                        onChange={(event) =>
                          setAnswer(
                            question.id,
                            question.type === "phone" ? formatPhone(event.target.value) : event.target.value,
                          )
                        }
                        className="h-11"
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" size="lg" disabled={step === 0} onClick={() => goToStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>

            {isLastStep ? (
              <Button type="submit" size="lg" disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submit.isPending ? "Enviando..." : "Enviar anamnese"}
              </Button>
            ) : (
              <Button type="submit" size="lg">
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-xs font-medium text-(--text-muted)">
          Depois do envio, nosso time analisa as respostas e devolve o seu diagnóstico em até 72 horas
          úteis.
        </p>
      </div>
    </div>
  );
}
