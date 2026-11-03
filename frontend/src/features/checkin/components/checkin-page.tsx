import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Textarea } from "../../../components/ui/field";
import { Card, Page, QueryState } from "../../../components/ui/page";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import type { Checkin, CheckinOption, CheckinResponse } from "../../../types/tracking";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-10" -> "outubro de 2026" */
export function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return `${MESES[Number(month) - 1] || month} de ${year}`;
}

// Quem avançou bem não precisa apontar um motivo de bloqueio.
const SEM_MOTIVO = "avancei_bem";

function OptionGroup({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: CheckinOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-bold text-(--text-main)">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--primary)",
              value === option.id
                ? "border-(--primary) bg-(--primary) text-white"
                : "border-(--border-strong) text-(--text-main) hover:bg-(--bg-surface-muted)",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckinSummary({ checkin }: { checkin: Checkin }) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">Andamento</dt>
        <dd className="mt-1 font-bold text-(--text-main)">
          {checkin.progressLabel}
          {checkin.reasonLabel && (
            <span className="font-medium text-(--text-muted)"> · {checkin.reasonLabel}</span>
          )}
        </dd>
      </div>
      {checkin.evolution && (
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
            Principal evolução
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-(--text-main)">{checkin.evolution}</dd>
        </div>
      )}
      {checkin.feedback && (
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-(--primary-text)">Devolutiva</dt>
          <dd className="mt-1 leading-relaxed text-(--text-main)">{checkin.feedback}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Check-in mensal de autogestão: três perguntas rápidas e uma devolutiva
 * curta para continuar ou retomar o plano.
 */
export function CheckinPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const queryKey = ["checkins", userId];
  const [progress, setProgress] = useState("");
  const [reason, setReason] = useState("");
  const [evolution, setEvolution] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => (await axios.get<CheckinResponse>("/api/checkins", authConfig())).data,
  });

  const submit = useMutation({
    mutationFn: async () =>
      (await axios.post("/api/checkins", { progress, reason, evolution }, authConfig())).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (submitError) =>
      setError(getErrorMessage(submitError, "Não foi possível registrar o check-in.")),
  });

  const data = query.data;
  const needsReason = Boolean(progress) && progress !== SEM_MOTIVO;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!progress) {
      setError("Diga como foi o andamento do seu plano neste mês.");
      return;
    }
    if (needsReason && !reason) {
      setError("Escolha o principal motivo.");
      return;
    }
    setError(null);
    submit.mutate();
  };

  return (
    <Page
      title="Check-in mensal"
      subtitle="Uma parada rápida, uma vez por mês, para olhar o andamento do seu plano e decidir o próximo passo."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o check-in."
      />

      {data && (
        <div className="space-y-8">
          {data.current ? (
            <Card>
              <div className="mb-4 flex items-center gap-2 text-(--primary-text)">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="text-lg font-bold text-(--text-main)">
                  Check-in de {formatPeriod(data.current.period)} feito
                </h2>
              </div>
              <CheckinSummary checkin={data.current} />
            </Card>
          ) : (
            <Card>
              <h2 className="text-lg font-bold text-(--text-main)">
                Check-in de {formatPeriod(data.period)}
              </h2>
              <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-6">
                <OptionGroup
                  legend="Como você avalia o andamento do seu plano neste mês?"
                  name="checkin-andamento"
                  options={data.progressOptions}
                  value={progress}
                  onChange={(value) => {
                    setProgress(value);
                    setError(null);
                  }}
                />

                {needsReason && (
                  <OptionGroup
                    legend="Qual foi o principal motivo?"
                    name="checkin-motivo"
                    options={data.reasonOptions}
                    value={reason}
                    onChange={(value) => {
                      setReason(value);
                      setError(null);
                    }}
                  />
                )}

                <Field label="Qual foi a sua principal evolução no mês? (opcional)" htmlFor="checkin-evolucao">
                  <Textarea
                    id="checkin-evolucao"
                    rows={3}
                    maxLength={1000}
                    value={evolution}
                    onChange={(event) => setEvolution(event.target.value)}
                  />
                </Field>

                {error && (
                  <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                    {error}
                  </p>
                )}

                <Button type="submit" size="lg" disabled={submit.isPending}>
                  {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar check-in
                </Button>
              </form>
            </Card>
          )}

          {data.history.length > 0 && (
            <section aria-labelledby="checkins-anteriores">
              <h2 id="checkins-anteriores" className="mb-4 text-lg font-bold text-(--text-main)">
                Meses anteriores
              </h2>
              <div className="space-y-3">
                {data.history.map((checkin) => (
                  <Card key={checkin.id}>
                    <h3 className="mb-3 text-sm font-bold capitalize text-(--text-main)">
                      {formatPeriod(checkin.period)}
                    </h3>
                    <CheckinSummary checkin={checkin} />
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
