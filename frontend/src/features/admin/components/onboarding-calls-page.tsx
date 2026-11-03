import { useRef, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Save,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatPhone, fromDateTimeLocal, toDateTimeLocal } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { toast } from "../../../store/use-toast-store";
import type { AdminOnboardingCall, OnboardingStatus } from "../../../types/tracking";
import { formatCallDateTime, formatCallTime, isHttpUrl } from "../../onboarding/onboarding-format";
import { useAdminAction, useAdminOnboardingCalls } from "../admin-api";
import { Badge, PlanBadge } from "../admin-shared";

const STATUS: Record<OnboardingStatus, { label: string; tone: "neutral" | "warning" | "success" }> = {
  scheduled: { label: "Agendada", tone: "warning" },
  done: { label: "Realizada", tone: "success" },
  canceled: { label: "Cancelada", tone: "neutral" },
};

/** Ainda vai acontecer: agendada e com o horário de término no futuro. */
export function isUpcomingCall(call: AdminOnboardingCall, now = Date.now()) {
  return call.status === "scheduled" && new Date(call.endsAt).getTime() >= now;
}

type RunAction = ReturnType<typeof useAdminAction>;

/** Remarcar: novo horário e motivo (os dois obrigatórios). */
function RescheduleModal({
  call,
  action,
  onClose,
}: {
  call: AdminOnboardingCall;
  action: RunAction;
  onClose: () => void;
}) {
  const [startsAt, setStartsAt] = useState("");
  const [reason, setReason] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const iso = fromDateTimeLocal(startsAt);
    if (!iso) {
      toast.error("Informe o novo horário.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      toast.error("O novo horário precisa ser no futuro.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do reagendamento.");
      return;
    }
    try {
      await action.mutateAsync({
        method: "post",
        path: `/onboarding-calls/${call.id}/reschedule`,
        body: { startsAt: iso, reason: reason.trim() },
        success: "Integração reagendada. O aluno foi avisado.",
      });
      onClose();
    } catch {
      // Mensagens 400/409 do servidor já apareceram em toast; a janela fica aberta.
    }
  };

  return (
    <Modal
      open
      title="Reagendar integração"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={`remarcar-${call.id}`} disabled={action.isPending}>
            {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar reagendamento
          </Button>
        </>
      }
    >
      <form id={`remarcar-${call.id}`} onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-(--text-muted)">
          {call.member.name} está marcado para {formatCallDateTime(call.startsAt)}. O aluno recebe um
          e-mail com o novo horário e o motivo.
        </p>
        <Field label="Novo horário" htmlFor={`remarcar-horario-${call.id}`}>
          <Input
            id={`remarcar-horario-${call.id}`}
            type="datetime-local"
            min={toDateTimeLocal(new Date().toISOString())}
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            required
          />
        </Field>
        <Field label="Motivo do reagendamento" htmlFor={`remarcar-motivo-${call.id}`}>
          <Textarea
            id={`remarcar-motivo-${call.id}`}
            rows={3}
            maxLength={1000}
            value={reason}
            placeholder="Ex.: imprevisto da equipe; vamos remarcar para um horário melhor."
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </Field>
      </form>
    </Modal>
  );
}

function CallCard({
  call,
  action,
  onCancel,
}: {
  call: AdminOnboardingCall;
  action: RunAction;
  onCancel: () => void;
}) {
  const [link, setLink] = useState(call.meetLink || "");
  const [notes, setNotes] = useState(call.adminNotes || "");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const savedLink = isHttpUrl(call.meetLink) ? call.meetLink.trim() : null;
  const scheduled = call.status === "scheduled";
  const done = call.status === "done";
  const typed = link.trim();
  const unchanged = typed === (call.meetLink || "");
  const notesUnchanged = notes.trim() === (call.adminNotes || "");

  const saveNotes = () =>
    action.mutate({
      method: "patch",
      path: `/onboarding-calls/${call.id}`,
      body: { adminNotes: notes.trim() },
      success: "Registro da equipe salvo.",
    });

  // Concluir exige o registro: sem ele, avisa e leva o foco ao campo.
  const markDone = () => {
    if (!notes.trim()) {
      toast.error("Registre o que foi feito antes de concluir.");
      notesRef.current?.focus();
      return;
    }
    action.mutate({
      method: "patch",
      path: `/onboarding-calls/${call.id}`,
      body: { status: "done", adminNotes: notes.trim() },
      success: "Integração marcada como realizada.",
    });
  };

  const saveLink = (event: React.FormEvent) => {
    event.preventDefault();
    if (typed && !isHttpUrl(typed)) {
      toast.error("Link inválido.", { message: "Cole o endereço completo, começando com https://." });
      return;
    }
    action.mutate({
      method: "patch",
      path: `/onboarding-calls/${call.id}`,
      body: { meetLink: typed || null },
      success: typed
        ? "Link salvo. O aluno foi avisado por e-mail e já vê o link na plataforma."
        : "Link removido.",
    });
  };

  const copyLink = async () => {
    if (!savedLink) return;
    try {
      await navigator.clipboard.writeText(savedLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS[call.status].tone}>{STATUS[call.status].label}</Badge>
            <PlanBadge plan={call.member.plan} />
            {scheduled && !isUpcomingCall(call) && <Badge tone="danger">Horário já passou</Badge>}
          </div>
          <h3 className="mt-2 text-base font-bold text-(--text-main)">
            <button
              type="button"
              onClick={() => navigate(`/adm/alunos/${encodeURIComponent(call.member.id)}`)}
              className="cursor-pointer text-left underline-offset-2 hover:underline"
            >
              {call.member.name}
            </button>
          </h3>
          <p className="break-all text-sm text-(--text-muted)">{call.member.email}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-(--text-main)">
            <CalendarClock className="h-4 w-4 shrink-0 text-(--text-muted)" />
            {formatCallDateTime(call.startsAt)} (até {formatCallTime(call.endsAt)})
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-(--text-main)">
            <MessageCircle className="h-4 w-4 shrink-0 text-(--text-muted)" />
            {call.whatsappUrl ? (
              <a
                href={call.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-(--primary-text) underline-offset-2 hover:underline"
              >
                {formatPhone(call.whatsapp)}
              </a>
            ) : (
              formatPhone(call.whatsapp) || "WhatsApp não informado"
            )}
          </p>
        </div>

        {(scheduled || done) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {scheduled && (
              <Button variant="soft" size="sm" disabled={action.isPending} onClick={markDone}>
                <Check className="h-3.5 w-3.5" />
                Marcar como realizada
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={action.isPending}
              onClick={() => setRescheduleOpen(true)}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Reagendar
            </Button>
            {scheduled && (
              <Button variant="ghost" size="sm" disabled={action.isPending} onClick={onCancel}>
                Cancelar
              </Button>
            )}
          </div>
        )}
      </div>

      {call.rescheduleReason && (
        <p className="text-xs font-medium text-(--text-muted)">
          Remarcada. Motivo: {call.rescheduleReason}
        </p>
      )}

      {(scheduled || savedLink) && (
        <div className="border-t border-(--border-subtle) pt-4">
          <label
            htmlFor={`integracao-link-${call.id}`}
            className="block text-[13px] font-bold text-(--text-main)"
          >
            Link da chamada (Google Meet)
          </label>

          {savedLink && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 break-all text-sm font-medium text-(--text-main)">
                {savedLink}
              </span>
              <a
                href={savedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-(--primary)/12 px-3 text-xs font-bold text-(--primary-text) transition hover:bg-(--primary)/18"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
              <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
          )}

          {scheduled && (
            <form onSubmit={saveLink} noValidate className="mt-2 flex flex-wrap gap-2">
              <Input
                id={`integracao-link-${call.id}`}
                type="url"
                inputMode="url"
                placeholder="https://meet.google.com/..."
                value={link}
                maxLength={500}
                onChange={(event) => setLink(event.target.value)}
                className="min-w-0 flex-1 basis-64"
              />
              <Button type="submit" variant="secondary" disabled={action.isPending || unchanged}>
                <Save className="h-4 w-4" />
                Salvar link
              </Button>
            </form>
          )}
          {scheduled && !savedLink && (
            <p className="mt-1.5 text-xs font-medium text-(--text-muted)">
              Ao salvar, o aluno é avisado por e-mail e passa a ver o link na plataforma.
            </p>
          )}
        </div>
      )}

      {(scheduled || done) && (
        <div className="border-t border-(--border-subtle) pt-4">
          <Field
            label="O que foi feito na integração"
            htmlFor={`integracao-registro-${call.id}`}
          >
            <Textarea
              ref={notesRef}
              id={`integracao-registro-${call.id}`}
              rows={3}
              maxLength={4000}
              value={notes}
              placeholder="Registro da equipe. Obrigatório para marcar como realizada."
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={action.isPending || notesUnchanged || !notes.trim()}
            onClick={saveNotes}
          >
            <Save className="h-4 w-4" />
            Salvar registro
          </Button>
        </div>
      )}

      {call.memberNotes ? (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-muted) p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
            Registro do aluno
            {call.memberNotesAt && (
              <span className="ml-2 font-medium normal-case tracking-normal">
                {formatCallDateTime(call.memberNotesAt)}
              </span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-main)">{call.memberNotes}</p>
        </div>
      ) : (
        done && <p className="text-xs font-medium text-(--text-muted)">O aluno ainda não registrou.</p>
      )}

      {rescheduleOpen && (
        <RescheduleModal call={call} action={action} onClose={() => setRescheduleOpen(false)} />
      )}
    </Card>
  );
}

/** Chamadas de integração do CRM agendadas pelos alunos. */
export function OnboardingCallsPage() {
  const query = useAdminOnboardingCalls();
  const action = useAdminAction();
  const [canceling, setCanceling] = useState<AdminOnboardingCall | null>(null);

  const calls = query.data || [];
  const byStart = (a: AdminOnboardingCall, b: AdminOnboardingCall) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  const proximas = calls.filter((call) => isUpcomingCall(call)).sort(byStart);
  const anteriores = calls
    .filter((call) => !isUpcomingCall(call))
    .sort((a, b) => byStart(b, a));

  const confirmCancel = async () => {
    if (!canceling) return;
    try {
      await action.mutateAsync({
        method: "patch",
        path: `/onboarding-calls/${canceling.id}`,
        body: { status: "canceled" },
        success: "Integração cancelada.",
      });
      setCanceling(null);
    } catch {
      // O aviso de erro já foi exibido; a janela fica aberta para tentar de novo.
    }
  };

  const renderList = (list: AdminOnboardingCall[]) => (
    <div className="space-y-3">
      {list.map((call) => (
        // Link salvo por outra pessoa da equipe: o campo recomeça com o valor novo.
        <CallCard
          key={`${call.id}:${call.meetLink || ""}`}
          call={call}
          action={action}
          onCancel={() => setCanceling(call)}
        />
      ))}
    </div>
  );

  return (
    <Page
      title="Integração CRM"
      subtitle="Chamadas de vídeo que os alunos agendaram para configurar e aprender o CRM. Cole o link do Google Meet em cada uma: o aluno é avisado por e-mail e vê o link na plataforma. Os dias e horários oferecidos ficam em Configurações."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as chamadas."
      />

      {query.data && (
        <div className="space-y-10">
          <section aria-labelledby="adm-integracao-proximas">
            <h2 id="adm-integracao-proximas" className="mb-4 text-lg font-bold text-(--text-main)">
              Próximas
            </h2>
            {proximas.length > 0 ? (
              renderList(proximas)
            ) : (
              <EmptyState>Nenhuma chamada agendada.</EmptyState>
            )}
          </section>

          {anteriores.length > 0 && (
            <section aria-labelledby="adm-integracao-anteriores">
              <h2 id="adm-integracao-anteriores" className="mb-4 text-lg font-bold text-(--text-main)">
                Anteriores
              </h2>
              {renderList(anteriores)}
            </section>
          )}
        </div>
      )}

      <Modal
        open={canceling !== null}
        title="Cancelar integração"
        onClose={() => setCanceling(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCanceling(null)} disabled={action.isPending}>
              Manter agendamento
            </Button>
            <Button
              onClick={() => void confirmCancel()}
              disabled={action.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar integração
            </Button>
          </>
        }
      >
        {canceling && (
          <p className="text-sm text-(--text-muted)">
            A integração de <strong className="text-(--text-main)">{canceling.member.name}</strong>,
            marcada para{" "}
            <strong className="text-(--text-main)">{formatCallDateTime(canceling.startsAt)}</strong>,
            será cancelada e o horário volta a ficar livre para outros alunos.
          </p>
        )}
      </Modal>
    </Page>
  );
}
