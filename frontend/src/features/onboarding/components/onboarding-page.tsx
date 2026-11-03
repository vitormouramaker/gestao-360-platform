import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Video,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Textarea } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatPhone } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { toast } from "../../../store/use-toast-store";
import type {
  OnboardingBooking,
  OnboardingDay,
  OnboardingPendingReview,
  OnboardingResponse,
} from "../../../types/tracking";
import { onboardingQueryKey, useOnboardingQuery } from "../hooks/use-onboarding-query";
import {
  buildMonthWeeks,
  formatCallDate,
  formatCallDateTime,
  formatCallDay,
  formatCallTime,
  formatDayLong,
  formatDuration,
  formatMonthTitle,
  isHttpUrl,
  isValidWhatsapp,
  monthOf,
  phoneDigits,
  todayDate,
} from "../onboarding-format";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary)";

const monthArrowClass = cn(
  "grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-(--text-main) transition-colors hover:bg-(--bg-surface-muted) disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
  focusRing,
);

/**
 * Calendário do mês, de domingo a sábado. Só os dias que a API devolveu são
 * clicáveis; os demais (fim de semana, passado, além do prazo) ficam apagados.
 */
function MonthCalendar({
  days,
  month,
  selectedDate,
  onSelect,
  onChangeMonth,
}: {
  days: OnboardingDay[];
  /** Mês em exibição: "AAAA-MM". */
  month: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onChangeMonth: (month: string) => void;
}) {
  const months = Array.from(new Set(days.map((day) => monthOf(day.date)))).sort();
  const monthIndex = months.indexOf(month);
  const previousMonth = monthIndex > 0 ? months[monthIndex - 1] : null;
  const nextMonth = monthIndex >= 0 && monthIndex < months.length - 1 ? months[monthIndex + 1] : null;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const today = todayDate();

  return (
    <div className="mx-auto w-full max-w-80">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mês anterior"
          disabled={!previousMonth}
          onClick={() => previousMonth && onChangeMonth(previousMonth)}
          className={monthArrowClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p aria-live="polite" className="text-sm font-bold text-(--text-main) first-letter:uppercase">
          {formatMonthTitle(month)}
        </p>
        <button
          type="button"
          aria-label="Próximo mês"
          disabled={!nextMonth}
          onClick={() => nextMonth && onChangeMonth(nextMonth)}
          className={monthArrowClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        aria-hidden="true"
        className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-(--text-muted)"
      >
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {buildMonthWeeks(month)
          .flat()
          .map((date, index) => {
            if (!date) return <span key={`vazio-${index}`} className="h-9" />;

            const number = Number(date.slice(8));
            const day = byDate.get(date);
            const isToday = date === today;
            const todayMark = isToday && "ring-1 ring-inset ring-(--text-soft)";

            // Fora do que a API oferece: aparece apagado e não é clicável.
            if (!day) {
              return (
                <span
                  key={date}
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-sm tabular-nums text-(--text-soft) opacity-60",
                    todayMark,
                  )}
                >
                  {number}
                </span>
              );
            }

            const free = day.slots.some((slot) => slot.available);
            const selected = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                disabled={!free}
                aria-pressed={selected}
                aria-label={`${formatDayLong(date)}${isToday ? ", hoje" : ""}${free ? "" : ", sem horários livres"}`}
                onClick={() => onSelect(date)}
                className={cn(
                  "grid h-9 cursor-pointer place-items-center rounded-lg text-sm font-bold tabular-nums transition-colors disabled:cursor-not-allowed disabled:font-medium disabled:text-(--text-muted) disabled:line-through disabled:opacity-60",
                  focusRing,
                  selected
                    ? "bg-(--primary) text-white"
                    : "text-(--text-main) enabled:bg-(--primary)/12 enabled:hover:bg-(--primary)/25",
                  !selected && todayMark,
                )}
              >
                {number}
              </button>
            );
          })}
      </div>

      <p className="mt-2 text-xs font-medium text-(--text-muted)">
        Os dias em destaque têm horários livres.
      </p>
    </div>
  );
}

/** Agendamento em aberto: data e WhatsApp de um lado, link da chamada do outro. */
function BookingCard({
  booking,
  busy,
  onReschedule,
  onCancel,
}: {
  booking: OnboardingBooking;
  busy: boolean;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const meetLink = isHttpUrl(booking.meetLink) ? booking.meetLink.trim() : null;

  const copyLink = async () => {
    if (!meetLink) return;
    try {
      await navigator.clipboard.writeText(meetLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.", { message: "Selecione o texto e copie." });
    }
  };

  return (
    <Card className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="flex items-center gap-2 text-(--primary-text)">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <h2 className="text-lg font-bold text-(--text-main)">Sua integração está agendada</h2>
        </div>

        <dl className="mt-4 space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-(--text-muted)" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">Data e horário</dt>
              <dd className="mt-1 text-base font-bold text-(--text-main)">
                <span className="inline-block first-letter:uppercase">
                  {formatCallDate(booking.startsAt)}, das {formatCallTime(booking.startsAt)} às{" "}
                  {formatCallTime(booking.endsAt)}
                </span>
              </dd>
              <dd className="mt-0.5 text-xs font-medium text-(--text-muted)">Horário de Brasília.</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-(--text-muted)" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">WhatsApp informado</dt>
              <dd className="mt-1 font-bold text-(--text-main)">{formatPhone(booking.whatsapp)}</dd>
            </div>
          </div>
        </dl>

        {booking.rescheduleReason && (
          <p className="mt-4 rounded-xl border border-(--border-subtle) bg-(--bg-surface-muted) p-3 text-sm font-medium text-(--text-main)">
            A nossa equipe remarcou este horário. Motivo: {booking.rescheduleReason}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onReschedule} disabled={busy}>
            Reagendar
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar agendamento
          </Button>
        </div>
      </div>

      <div className="self-start rounded-xl border border-(--border-subtle) bg-(--bg-surface-muted) p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-(--text-main)">
          <Video className="h-4 w-4 shrink-0 text-(--primary-text)" />
          Link da chamada (Google Meet)
        </p>
        {meetLink ? (
          <>
            <p className="mt-2 select-all break-all text-sm font-medium text-(--text-main)">{meetLink}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-(--primary) px-4 text-sm font-bold text-white transition hover:bg-(--primary-hover) sm:flex-none",
                  focusRing,
                )}
              >
                <ExternalLink className="h-4 w-4" />
                Ir para a chamada
              </a>
              <Button variant="secondary" onClick={() => void copyLink()} className="flex-1 sm:flex-none">
                <Copy className="h-4 w-4" />
                Copiar link
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm font-medium text-(--text-muted)">
            O link da chamada será disponibilizado aqui e enviado no seu WhatsApp antes do horário.
          </p>
        )}
      </div>
    </Card>
  );
}

const DISMISSED_REVIEW_KEY = "g360_onboarding_review_dismissed";

/** A pessoa já dispensou o registro desta chamada nesta sessão? */
function isReviewDismissed(id: string) {
  try {
    return sessionStorage.getItem(DISMISSED_REVIEW_KEY) === id;
  } catch {
    return false;
  }
}

/**
 * Registro opcional depois da chamada: aparece em destaque quando a API devolve
 * `pendingReview`. Salvar some com o card (a consulta recarrega sem pendingReview);
 * "Agora não" esconde só nesta sessão.
 */
function PendingReviewCard({
  review,
  onDismiss,
  onSaved,
}: {
  review: OnboardingPendingReview;
  onDismiss: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      (await axios.post<{ booking: OnboardingBooking }>(
        "/api/onboarding/notes",
        { notes: notes.trim() },
        authConfig(),
      )).data,
    onSuccess: () => {
      toast.success("Registro enviado. Obrigado!");
      onSaved();
    },
    onError: (saveError) =>
      toast.error("Não foi possível salvar o registro.", {
        message: getErrorMessage(saveError, "Tente novamente."),
      }),
  });

  return (
    <Card className="border-(--primary) bg-(--primary)/8">
      <h2 className="text-lg font-bold text-(--text-main)">Como foi a sua integração do CRM?</h2>
      <p className="mt-1 text-sm font-medium text-(--text-muted)">
        Conte rapidamente o que você viu na chamada de {formatCallDay(review.startsAt)}. É opcional e
        ajuda a nossa equipe a acompanhar.
      </p>
      <Field label="Seu registro" htmlFor="integracao-registro" className="mt-4">
        <Textarea
          id="integracao-registro"
          rows={4}
          maxLength={4000}
          value={notes}
          placeholder="Ex.: configuramos o funil e o time já consegue cadastrar os leads."
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !notes.trim()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar registro
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={save.isPending}>
          Agora não
        </Button>
      </div>
    </Card>
  );
}

/**
 * Integração do CRM: o aluno escolhe dia e horário para uma chamada de vídeo
 * com o time, e depois encontra aqui o link do Google Meet.
 */
export function OnboardingPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const queryKey = onboardingQueryKey(userId);
  const query = useOnboardingQuery();
  const { refetch } = query;

  const [rescheduling, setRescheduling] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // null = acompanha o mês do dia escolhido.
  const [viewedMonth, setViewedMonth] = useState<string | null>(null);
  // null = a pessoa ainda não mexeu no campo; vale o número que a API devolveu.
  const [typedWhatsapp, setTypedWhatsapp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Troca ao dispensar o registro: força reavaliar o flag de sessão.
  const [dismissTick, setDismissTick] = useState(0);

  // O menu lateral mantém a consulta em memória: ao abrir a tela, confere os horários.
  useEffect(() => {
    void refetch({ cancelRefetch: false });
  }, [refetch]);

  const data = query.data;
  const booking = data?.booking?.status === "scheduled" ? data.booking : null;
  const pendingReview =
    data?.pendingReview && !isReviewDismissed(data.pendingReview.id) ? data.pendingReview : null;
  void dismissTick;
  const lastDone = data?.lastDone || null;
  const days = data?.days || [];
  const availableDays = days.filter((day) => day.slots.some((slot) => slot.available));
  const currentDay =
    availableDays.find((day) => day.date === selectedDate) || availableDays[0] || null;
  const currentSlot =
    currentDay?.slots.find((slot) => slot.available && slot.startsAt === selectedSlot) || null;
  const month =
    viewedMonth && days.some((day) => monthOf(day.date) === viewedMonth)
      ? viewedMonth
      : currentDay
        ? monthOf(currentDay.date)
        : null;
  // A API devolve só dígitos: a máscara vale tanto para o valor inicial quanto para o digitado.
  const whatsapp = formatPhone(typedWhatsapp ?? (booking?.whatsapp || data?.whatsapp || ""));
  const duration = data ? formatDuration(data.slotMinutes) : "";
  const showPicker = !booking || rescheduling;

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setViewedMonth(monthOf(date));
    setSelectedSlot(null);
    setError(null);
  };

  const changeMonth = (nextMonth: string) => {
    setViewedMonth(nextMonth);
    // Os horários ao lado acompanham o mês: vale o primeiro dia livre dele.
    const firstFree = availableDays.find((day) => monthOf(day.date) === nextMonth);
    if (firstFree) {
      setSelectedDate(firstFree.date);
      setSelectedSlot(null);
      setError(null);
    }
  };

  const book = useMutation({
    mutationFn: async (input: { startsAt: string; whatsapp: string }) =>
      (await axios.post<{ booking: OnboardingBooking }>("/api/onboarding", input, authConfig())).data,
    onSuccess: (result) => {
      queryClient.setQueryData<OnboardingResponse>(queryKey, (current) =>
        current ? { ...current, booking: result.booking } : current,
      );
      void queryClient.invalidateQueries({ queryKey });
      toast.success(rescheduling ? "Integração reagendada." : "Integração agendada.", {
        message: `${formatCallDateTime(result.booking.startsAt)} (horário de Brasília).`,
      });
      setRescheduling(false);
      setSelectedSlot(null);
      setError(null);
    },
    onError: (bookError) => {
      toast.error("Não foi possível agendar.", {
        message: getErrorMessage(bookError, "Tente novamente."),
      });
      // 409 = o horário acabou de ser ocupado: a lista é recarregada.
      if (axios.isAxiosError(bookError) && bookError.response?.status === 409) {
        setSelectedSlot(null);
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const cancel = useMutation({
    mutationFn: async () => (await axios.post("/api/onboarding/cancel", {}, authConfig())).data,
    onSuccess: () => {
      queryClient.setQueryData<OnboardingResponse>(queryKey, (current) =>
        current ? { ...current, booking: null } : current,
      );
      void queryClient.invalidateQueries({ queryKey });
      setCancelOpen(false);
      setRescheduling(false);
      toast.success("Agendamento cancelado.");
    },
    onError: (cancelError) =>
      toast.error("Não foi possível cancelar.", {
        message: getErrorMessage(cancelError, "Tente novamente."),
      }),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentSlot) {
      setError("Escolha um dia e um horário.");
      return;
    }
    if (!isValidWhatsapp(whatsapp)) {
      setError("Informe o seu WhatsApp com DDD.");
      return;
    }
    setError(null);
    book.mutate({ startsAt: currentSlot.startsAt, whatsapp: phoneDigits(whatsapp) });
  };

  return (
    <Page
      title="Integração CRM"
      subtitle={
        <>
          Chamada de vídeo{duration ? ` de cerca de ${duration}` : ""} com o time da Gestão 360 para
          configurar o CRM com você. O link (Google Meet) aparece aqui e chega no seu WhatsApp. Já
          está incluída na sua assinatura.
        </>
      }
      className="py-5 sm:py-6 [&>header]:mb-5"
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError && !data}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os horários da integração."
      />

      {data?.enabled === false && (
        <EmptyState>A Integração CRM não faz parte da sua assinatura.</EmptyState>
      )}

      {data && data.enabled !== false && (
        <div className="space-y-4">
          {pendingReview && (
            <PendingReviewCard
              review={pendingReview}
              onSaved={() => void refetch()}
              onDismiss={() => {
                try {
                  sessionStorage.setItem(DISMISSED_REVIEW_KEY, pendingReview.id);
                } catch {
                  // Sem sessionStorage: dispensa vale só até recarregar a página.
                }
                setDismissTick((tick) => tick + 1);
              }}
            />
          )}

          {booking && !rescheduling && (
            <BookingCard
              booking={booking}
              busy={cancel.isPending}
              onReschedule={() => {
                setSelectedSlot(null);
                setError(null);
                setRescheduling(true);
              }}
              onCancel={() => setCancelOpen(true)}
            />
          )}

          {!booking && lastDone && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <strong>Integração realizada em {formatCallDay(lastDone.startsAt)}.</strong>
              Precisa de outra sessão? Agende abaixo.
            </p>
          )}

          {showPicker &&
            (!currentDay || !month ? (
              <div className="max-w-2xl space-y-3">
                <EmptyState>
                  Nenhum horário disponível nos próximos dias. Fale com o suporte.
                </EmptyState>
                {rescheduling && (
                  <Button variant="secondary" onClick={() => setRescheduling(false)}>
                    Manter o agendamento atual
                  </Button>
                )}
              </div>
            ) : (
              <Card className="p-4 sm:p-5">
                <h2 className="text-lg font-bold text-(--text-main)">
                  {rescheduling ? "Escolha o novo dia e horário" : "Escolha o dia e o horário"}
                </h2>
                {rescheduling && booking && (
                  <p className="mt-1 text-sm font-medium text-(--text-muted)">
                    Agendamento atual: {formatCallDateTime(booking.startsAt)}. Ele só é trocado
                    quando você confirmar o novo horário.
                  </p>
                )}

                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="mt-4 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8"
                >
                  <MonthCalendar
                    days={days}
                    month={month}
                    selectedDate={currentDay.date}
                    onSelect={selectDate}
                    onChangeMonth={changeMonth}
                  />

                  <div className="min-w-0 space-y-4">
                    <fieldset>
                      <legend className="text-[13px] font-bold text-(--text-main)">
                        Horários de {formatDayLong(currentDay.date)}
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {currentDay.slots.map((slot) => {
                          const selected = currentSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={!slot.available}
                              aria-pressed={selected}
                              aria-label={slot.available ? slot.time : `${slot.time}, indisponível`}
                              onClick={() => {
                                setSelectedSlot(slot.startsAt);
                                setError(null);
                              }}
                              className={cn(
                                "h-10 w-20 cursor-pointer rounded-xl border text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-45",
                                focusRing,
                                selected
                                  ? "border-(--primary) bg-(--primary) text-white"
                                  : "border-(--border-strong) text-(--text-main) enabled:hover:bg-(--bg-surface-muted)",
                              )}
                            >
                              {slot.time}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-(--text-muted)">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        Horário de Brasília. Cada chamada dura cerca de {duration}.
                      </p>
                    </fieldset>

                    <Field
                      label="Seu WhatsApp"
                      htmlFor="integracao-whatsapp"
                      hint="É por ele que o time envia o link da chamada."
                      className="max-w-xs"
                    >
                      <Input
                        id="integracao-whatsapp"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        value={whatsapp}
                        onChange={(event) => {
                          setTypedWhatsapp(formatPhone(event.target.value));
                          setError(null);
                        }}
                      />
                    </Field>

                    {error && (
                      <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                        {error}
                      </p>
                    )}

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="submit" size="lg" disabled={book.isPending}>
                          {book.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Confirmar agendamento
                        </Button>
                        {rescheduling && (
                          <Button
                            variant="ghost"
                            size="lg"
                            disabled={book.isPending}
                            onClick={() => {
                              setRescheduling(false);
                              setError(null);
                            }}
                          >
                            Manter o agendamento atual
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 min-h-5 text-sm font-medium text-(--text-muted)">
                        {currentSlot
                          ? `Você está agendando para ${formatCallDateTime(currentSlot.startsAt)}.`
                          : "Escolha um horário para confirmar."}
                      </p>
                    </div>
                  </div>
                </form>
              </Card>
            ))}
        </div>
      )}

      <Modal
        open={cancelOpen && Boolean(booking)}
        title="Cancelar agendamento"
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>
              Manter agendamento
            </Button>
            <Button
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar agendamento
            </Button>
          </>
        }
      >
        <p className="text-sm text-(--text-muted)">
          {booking && (
            <>
              A sua integração de{" "}
              <strong className="text-(--text-main)">{formatCallDateTime(booking.startsAt)}</strong>{" "}
              será cancelada e o horário volta a ficar livre.{" "}
            </>
          )}
          Você pode agendar de novo quando quiser.
        </p>
      </Modal>
    </Page>
  );
}
