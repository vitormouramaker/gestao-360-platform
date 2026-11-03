import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Card, Page, QueryState } from "../../../components/ui/page";
import { cn } from "../../../lib/utils";
import type { AdminSettings } from "../../../types/tracking";
import { offeredTimes } from "../../onboarding/onboarding-format";
import { useAdminAction, useAdminSettings } from "../admin-api";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary)";

const EMPTY: AdminSettings = {
  supportWhatsapp: "",
  supportStart: "09:00",
  supportEnd: "18:00",
  supportDays: "0,1,2,3,4,5,6",
  supportIdleMinutes: "15",
  supportAlertEmail: "",
  supportHours: "",
  onboardingDays: "1,2,3,4,5",
  onboardingStart: "11:00",
  onboardingEnd: "13:00",
  onboardingStart2: "14:00",
  onboardingEnd2: "17:00",
  onboardingSlotMinutes: "90",
  onboardingGapMinutes: "15",
  crmEnabled: "0",
};

/**
 * O formulário guarda tudo como texto. Campo que a API ainda não devolve fica
 * com o valor padrão; lista de dias ou número são convertidos para texto.
 */
function toForm(settings: Partial<Record<keyof AdminSettings, unknown>>): AdminSettings {
  const form = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as Array<keyof AdminSettings>) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    form[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return form;
}

const DAYS = [
  { id: "1", label: "Seg" },
  { id: "2", label: "Ter" },
  { id: "3", label: "Qua" },
  { id: "4", label: "Qui" },
  { id: "5", label: "Sex" },
  { id: "6", label: "Sáb" },
  { id: "0", label: "Dom" },
];

/** Contato humano do suporte e destino dos avisos. Vale assim que salva. */
export function SettingsPage() {
  const query = useAdminSettings();
  const action = useAdminAction();
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (query.data) setForm(toForm(query.data));
  }, [query.data]);

  const days = form.supportDays.split(",").filter(Boolean);
  const onboardingDays = form.onboardingDays.split(",").filter(Boolean);
  const toggleDay = (field: "supportDays" | "onboardingDays", id: string) => {
    const current = form[field].split(",").filter(Boolean);
    setForm({
      ...form,
      [field]: (current.includes(id) ? current.filter((day) => day !== id) : [...current, id]).join(","),
    });
  };

  // Prévia dos horários, calculada aqui com a mesma regra do servidor.
  const slotMinutes = Number(form.onboardingSlotMinutes);
  const gapMinutes = Number(form.onboardingGapMinutes);
  const secondPeriodHalf = Boolean(form.onboardingStart2) !== Boolean(form.onboardingEnd2);
  const onboardingTimes = offeredTimes(
    [
      { start: form.onboardingStart, end: form.onboardingEnd },
      { start: form.onboardingStart2, end: form.onboardingEnd2 },
    ],
    slotMinutes,
    gapMinutes,
  );
  let onboardingPreview: string;
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) {
    onboardingPreview = "Informe a duração de cada integração, de 15 a 240 minutos.";
  } else if (form.onboardingGapMinutes === "" || !Number.isInteger(gapMinutes) || gapMinutes < 0 || gapMinutes > 120) {
    onboardingPreview = "Informe o intervalo entre integrações, de 0 a 120 minutos.";
  } else if (secondPeriodHalf) {
    onboardingPreview = "Segundo período: informe o início e o fim, ou deixe os dois vazios.";
  } else if (onboardingTimes.length === 0) {
    onboardingPreview = "Nenhum horário cabe nesses períodos com essa duração.";
  } else {
    onboardingPreview = `Horários oferecidos por dia: ${onboardingTimes.join(", ")}`;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // crmEnabled vai como booleano: o backend lê o campo como marcado/desmarcado.
    action.mutate({
      method: "put",
      path: "/settings",
      body: { ...form, crmEnabled: form.crmEnabled === "1" },
    });
  };

  return (
    <Page
      title="Configurações"
      subtitle="Contato do time humano e destino dos avisos. Quando a IA de suporte não resolve, o aluno escolhe entre falar com o time pelo WhatsApp cadastrado aqui ou pelo próprio chat."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as configurações."
      />

      {query.data && (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-(--text-main)">Atendimento humano</h2>
            <Field
              label="WhatsApp do time de suporte"
              htmlFor="config-whatsapp"
              hint={
                form.supportWhatsapp
                  ? "Número com DDD, só números. É para onde o botão do chat leva o aluno."
                  : "Sem número cadastrado, o aluno só recebe a opção de falar com a equipe pelo chat."
              }
            >
              <Input
                id="config-whatsapp"
                inputMode="numeric"
                placeholder="11999998888"
                value={form.supportWhatsapp}
                maxLength={20}
                onChange={(event) => setForm({ ...form, supportWhatsapp: event.target.value })}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-bold text-(--text-main)">
                Dias de atendimento do time
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <label
                    key={day.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-(--border-subtle) px-3 py-2 text-sm font-medium text-(--text-main)"
                  >
                    <input
                      type="checkbox"
                      checked={days.includes(day.id)}
                      onChange={() => toggleDay("supportDays", day.id)}
                      className="h-4 w-4 accent-(--primary)"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Início do atendimento" htmlFor="config-inicio">
                <Input
                  id="config-inicio"
                  type="time"
                  value={form.supportStart}
                  onChange={(event) => setForm({ ...form, supportStart: event.target.value })}
                  required
                />
              </Field>
              <Field label="Fim do atendimento" htmlFor="config-fim">
                <Input
                  id="config-fim"
                  type="time"
                  value={form.supportEnd}
                  onChange={(event) => setForm({ ...form, supportEnd: event.target.value })}
                  required
                />
              </Field>
            </div>
            <p className="text-xs font-medium text-(--text-muted)">
              Horário de Brasília. Hoje a IA informa ao aluno: {query.data.supportHours}. Fora desse
              horário a opção de falar com a equipe pelo chat não aparece.
            </p>
            <Field
              label="Devolver à fila depois de quantos minutos sem resposta"
              htmlFor="config-ocioso"
              hint="Se quem assumiu o atendimento deixar o aluno sem resposta por esse tempo, a conversa volta para a fila e outra pessoa pode assumir. De 2 a 240 minutos."
            >
              <Input
                id="config-ocioso"
                type="number"
                min={2}
                max={240}
                value={form.supportIdleMinutes}
                onChange={(event) => setForm({ ...form, supportIdleMinutes: event.target.value })}
                required
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-(--text-main)">Avisos</h2>
            <Field
              label="E-mail que recebe os avisos do suporte"
              htmlFor="config-alerta"
              hint="Avisa quando um aluno entra na fila de atendimento do chat e nos casos de uso indevido grave. Para mais de um e-mail, separe por vírgula. Vazio desliga os avisos."
            >
              <Input
                id="config-alerta"
                value={form.supportAlertEmail}
                maxLength={300}
                onChange={(event) => setForm({ ...form, supportAlertEmail: event.target.value })}
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-(--text-main)">
              Integração CRM: novos clientes
            </h2>
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.crmEnabled === "1"}
                aria-label="Conceder o CRM a quem assinar a partir de agora"
                onClick={() =>
                  setForm({ ...form, crmEnabled: form.crmEnabled === "1" ? "0" : "1" })
                }
                className={cn(
                  "mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors",
                  focusRing,
                  form.crmEnabled === "1" ? "bg-(--primary)" : "bg-(--border-strong)",
                )}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded-full bg-white shadow transition-transform",
                    form.crmEnabled === "1" ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
              <span className="text-sm font-medium text-(--text-main)">
                Conceder o CRM a quem assinar a partir de agora.
                <span className="mt-1 block text-xs font-medium text-(--text-muted)">
                  Ligado: o novo cliente recebe o acesso ao CRM e o agendamento da integração, como
                  antes. Desligado: o novo cliente não recebe o CRM. Isso não mexe em quem já tem (que
                  mantém o acesso) nem no ajuste individual feito no perfil de cada aluno.
                </span>
              </span>
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-(--text-main)">
              Integração CRM: horários para agendamento
            </h2>
            <p className="text-sm text-(--text-muted)">
              Dias e horários em que o aluno pode marcar a chamada de integração do CRM. As chamadas
              agendadas ficam em Integração CRM, no menu.
            </p>
            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-bold text-(--text-main)">
                Dias com horários para agendamento
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <label
                    key={day.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-(--border-subtle) px-3 py-2 text-sm font-medium text-(--text-main)"
                  >
                    <input
                      type="checkbox"
                      checked={onboardingDays.includes(day.id)}
                      onChange={() => toggleDay("onboardingDays", day.id)}
                      className="h-4 w-4 accent-(--primary)"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1.5 block text-[13px] font-bold text-(--text-main)">
                  Primeiro período
                </legend>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label="Início do primeiro período"
                    value={form.onboardingStart}
                    onChange={(event) => setForm({ ...form, onboardingStart: event.target.value })}
                    required
                  />
                  <span className="text-sm font-medium text-(--text-muted)">às</span>
                  <Input
                    type="time"
                    aria-label="Fim do primeiro período"
                    value={form.onboardingEnd}
                    onChange={(event) => setForm({ ...form, onboardingEnd: event.target.value })}
                    required
                  />
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 block text-[13px] font-bold text-(--text-main)">
                  Segundo período (opcional)
                </legend>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label="Início do segundo período"
                    value={form.onboardingStart2}
                    onChange={(event) => setForm({ ...form, onboardingStart2: event.target.value })}
                  />
                  <span className="text-sm font-medium text-(--text-muted)">às</span>
                  <Input
                    type="time"
                    aria-label="Fim do segundo período"
                    value={form.onboardingEnd2}
                    onChange={(event) => setForm({ ...form, onboardingEnd2: event.target.value })}
                  />
                </div>
                {(form.onboardingStart2 || form.onboardingEnd2) && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, onboardingStart2: "", onboardingEnd2: "" })}
                    className="mt-1.5 cursor-pointer text-xs font-bold text-(--primary-text) underline-offset-2 hover:underline"
                  >
                    Remover o segundo período
                  </button>
                )}
              </fieldset>
              <Field label="Duração de cada integração (min)" htmlFor="config-integracao-duracao">
                <Input
                  id="config-integracao-duracao"
                  type="number"
                  min={15}
                  max={240}
                  value={form.onboardingSlotMinutes}
                  onChange={(event) => setForm({ ...form, onboardingSlotMinutes: event.target.value })}
                  required
                />
              </Field>
              <Field label="Intervalo entre integrações (min)" htmlFor="config-integracao-intervalo">
                <Input
                  id="config-integracao-intervalo"
                  type="number"
                  min={0}
                  max={120}
                  value={form.onboardingGapMinutes}
                  onChange={(event) => setForm({ ...form, onboardingGapMinutes: event.target.value })}
                  required
                />
              </Field>
            </div>
            <p
              aria-live="polite"
              className="rounded-xl bg-(--bg-surface-muted) px-3 py-2 text-sm font-medium text-(--text-main)"
            >
              {onboardingPreview}
            </p>
            <p className="text-xs font-medium text-(--text-muted)">
              Horário de Brasília. Em cada período a primeira integração começa no início do período, a
              seguinte começa depois da duração mais o intervalo, e só é oferecida a que termina até o
              fim do período.
            </p>
          </Card>

          <p className="text-sm text-(--text-muted)">
            O link do grupo exclusivo do WhatsApp fica em Entregáveis, no item Grupo Exclusivo no
            WhatsApp. Com o link cadastrado, o botão Entrar no grupo do WhatsApp aparece no topo da
            área do aluno.
          </p>

          <Button type="submit" disabled={action.isPending}>
            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </form>
      )}
    </Page>
  );
}
