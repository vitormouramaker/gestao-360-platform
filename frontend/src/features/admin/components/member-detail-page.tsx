import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Select } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Card, Page, QueryState } from "../../../components/ui/page";
import { formatDate, formatDateTimeBrasilia, formatDocument, formatPhone } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { cn } from "../../../lib/utils";
import type { PlanId } from "../../../types/catalog";
import type {
  AdminMemberAccess,
  AdminMemberDetail,
  Answers,
  DiagnosticQuestion,
  EmailDeliveryStatus,
} from "../../../types/tracking";
import { formatPeriod } from "../../checkin/components/checkin-page";
import { DiagnosticAnswers } from "../../diagnostic/components/diagnostic-answers";
import { MessageBubble } from "../../support/components/support-chat";
import { useAdminAction, useAdminMember, useAdminMemberDelivery, useAdminMemberEmails } from "../admin-api";
import { Badge, DueBadge, JourneyBadge, PlanBadge } from "../admin-shared";

interface MemberDetailPageProps {
  memberId: string;
}

/** Tudo de um aluno: acesso, anamnese, planos, check-ins, suporte e acessos individuais. */
export function MemberDetailPage({ memberId }: MemberDetailPageProps) {
  const query = useAdminMember(memberId);
  const action = useAdminAction();
  const data = query.data;

  return (
    <Page
      title={data?.member.name || "Aluno"}
      subtitle={data?.member.email}
      actions={
        <Button variant="secondary" onClick={() => navigate("/adm/alunos")}>
          <ArrowLeft className="h-4 w-4" />
          Alunos
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar o aluno."
      />

      {data && (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <PlanBadge plan={data.member.plan} />
              <JourneyBadge member={data.member} />
              <span className="text-xs font-medium text-(--text-muted)">
                Aluno desde {formatDate(data.member.createdAt)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_12rem_1fr] lg:items-end">
              <Field label="Plano" htmlFor="aluno-mudar-plano">
                <Select
                  id="aluno-mudar-plano"
                  value={data.member.plan}
                  disabled={action.isPending}
                  onChange={(event) =>
                    action.mutate({
                      method: "patch",
                      path: `/members/${memberId}`,
                      body: { plan: event.target.value as PlanId },
                      success: "Plano atualizado.",
                    })
                  }
                >
                  <option value="essencial">Essencial</option>
                  <option value="premium">Premium</option>
                </Select>
              </Field>
              <Field label="Acesso" htmlFor="aluno-acesso">
                <Select
                  id="aluno-acesso"
                  value={data.member.accessStatus}
                  disabled={action.isPending}
                  onChange={(event) =>
                    action.mutate({
                      method: "patch",
                      path: `/members/${memberId}`,
                      body: { accessStatus: event.target.value },
                      success: "Acesso atualizado.",
                    })
                  }
                >
                  <option value="active">Liberado</option>
                  <option value="suspended">Suspenso</option>
                </Select>
              </Field>
              <Field label="Integração CRM" htmlFor="aluno-crm">
                <Select
                  id="aluno-crm"
                  value={data.member.crmEnabled ? "1" : "0"}
                  disabled={action.isPending}
                  onChange={(event) =>
                    action.mutate({
                      method: "patch",
                      path: `/members/${memberId}`,
                      body: { crmEnabled: event.target.value === "1" },
                      success: "Integração CRM atualizada.",
                    })
                  }
                >
                  <option value="1">Ligada</option>
                  <option value="0">Desligada</option>
                </Select>
              </Field>
              <PhoneField memberId={memberId} phone={data.member.phone ?? null} />
              <DocumentField memberId={memberId} document={data.member.document ?? null} />
              <Field label="Data da compra" htmlFor="aluno-data-compra">
                <Input
                  id="aluno-data-compra"
                  type="date"
                  // Recarrega o campo quando o valor salvo muda.
                  key={data.member.purchaseDate || "sem-data"}
                  defaultValue={data.member.purchaseDate || ""}
                  disabled={action.isPending}
                  onBlur={(event) => {
                    if (event.target.value === (data.member.purchaseDate || "")) return;
                    action.mutate({
                      method: "patch",
                      path: `/members/${memberId}`,
                      body: { purchaseDate: event.target.value },
                      success: "Data da compra atualizada.",
                    });
                  }}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <span className="text-xs font-medium text-(--text-muted)">
                  {data.member.welcomeSentAt
                    ? `E-mail de acesso enviado em ${formatDate(data.member.welcomeSentAt)}`
                    : "E-mail de acesso ainda não enviado"}
                </span>
                <Button
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ method: "post", path: `/members/${memberId}/resend-access` })}
                >
                  <Mail className="h-4 w-4" />
                  {data.member.hasPassword ? "Enviar link de nova senha" : "Reenviar e-mail de acesso"}
                </Button>
              </div>
            </div>
          </Card>

          <PlansSection memberId={memberId} data={data} />

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-(--text-main)">Anamnese</h2>
              {data.diagnostic?.status === "submitted" ? (
                <Badge tone="success">Enviada em {formatDate(data.diagnostic.submittedAt)}</Badge>
              ) : data.diagnostic ? (
                <Badge tone="neutral">Rascunho, ainda não enviada</Badge>
              ) : (
                <Badge tone="neutral">Não começou</Badge>
              )}
            </div>
            {data.diagnostic && (
              <div className="mt-5">
                <DiagnosticAnswers questions={data.questions} answers={data.diagnostic.answers} />
              </div>
            )}
          </Card>

          {data.diagnostic && (
            <IndicatorsEditor
              key={data.diagnostic.updatedAt || "sem-update"}
              memberId={memberId}
              questions={data.questions}
              answers={data.diagnostic.answers}
            />
          )}

          <Card>
            <h2 className="text-lg font-bold text-(--text-main)">Check-ins mensais</h2>
            {data.checkins.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-(--text-muted)">Nenhum check-in feito.</p>
            ) : (
              <ul className="mt-4 divide-y divide-(--border-subtle)">
                {data.checkins.map((checkin) => (
                  <li key={checkin.id} className="py-3 text-sm">
                    <p className="font-bold text-(--text-main)">
                      <span className="capitalize">{formatPeriod(checkin.period)}</span>:{" "}
                      {checkin.progressLabel.toLowerCase()}
                      {checkin.reasonLabel && (
                        <span className="font-medium text-(--text-muted)"> · {checkin.reasonLabel}</span>
                      )}
                    </p>
                    {checkin.evolution && (
                      <p className="mt-1 whitespace-pre-wrap text-(--text-muted)">{checkin.evolution}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <DeliverySection memberId={memberId} memberEmail={data.member.email} welcomeSentAt={data.member.welcomeSentAt} />

          <EmailsSection memberId={memberId} />

          <ExternalAccountsSection memberId={memberId} data={data} />

          <SupportSection data={data} />

          <Card>
            <h2 className="text-lg font-bold text-(--text-main)">Acessos individuais</h2>
            <p className="mt-1 text-sm text-(--text-muted)">
              Link ou ingresso só deste aluno (ex.: passaporte do Evento Anual). Em branco, vale o link
              geral do entregável.
            </p>
            <div className="mt-4 divide-y divide-(--border-subtle)">
              {data.accesses.map((access) => (
                <AccessRow key={access.productId} memberId={memberId} access={access} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

/** CPF ou CNPJ do aluno: vem da Hubla ou do cadastro; a equipe corrige aqui. */
function DocumentField({ memberId, document }: { memberId: string; document: string | null }) {
  const action = useAdminAction();
  const saved = document ? formatDocument(document) : "";
  const [value, setValue] = useState(saved);
  const digits = (text: string) => text.replace(/\D/g, "");

  return (
    <Field label="CPF ou CNPJ" htmlFor="aluno-documento" hint={document ? undefined : "Sem documento no cadastro."}>
      <Input
        id="aluno-documento"
        inputMode="numeric"
        placeholder="000.000.000-00"
        maxLength={18}
        // Recarrega o campo quando o valor salvo muda.
        key={saved || "sem-documento"}
        defaultValue={saved}
        disabled={action.isPending}
        onChange={(event) => {
          const masked = formatDocument(event.target.value);
          event.target.value = masked;
          setValue(masked);
        }}
        onBlur={() => {
          if (digits(value) === digits(saved)) return;
          action.mutate({
            method: "patch",
            path: `/members/${memberId}`,
            body: { document: digits(value) },
            success: digits(value) ? "Documento atualizado." : "Documento removido.",
          });
        }}
      />
    </Field>
  );
}

/** WhatsApp do aluno: vem da Hubla, do cadastro ou da anamnese; a equipe corrige aqui. */
function PhoneField({ memberId, phone }: { memberId: string; phone: string | null }) {
  const action = useAdminAction();
  const [value, setValue] = useState(() => (phone ? formatPhone(phone) : ""));
  const digits = (text: string) => text.replace(/\D/g, "");
  const saved = phone ? formatPhone(phone) : "";

  return (
    <Field
      label="WhatsApp"
      htmlFor="aluno-whatsapp"
      hint={phone ? undefined : "Sem telefone no cadastro."}
    >
      <Input
        id="aluno-whatsapp"
        type="tel"
        inputMode="tel"
        placeholder="(00) 00000-0000"
        maxLength={15}
        // Recarrega o campo quando o valor salvo muda.
        key={saved || "sem-telefone"}
        defaultValue={saved}
        disabled={action.isPending}
        onChange={(event) => {
          const masked = formatPhone(event.target.value);
          event.target.value = masked;
          setValue(masked);
        }}
        onBlur={() => {
          if (digits(value) === digits(saved)) return;
          action.mutate({
            method: "patch",
            path: `/members/${memberId}`,
            body: { phone: digits(value) },
            success: digits(value) ? "WhatsApp atualizado." : "WhatsApp removido.",
          });
        }}
      />
      {phone && (
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs font-semibold text-(--primary-text) underline-offset-2 hover:underline"
        >
          Abrir conversa no WhatsApp
        </a>
      )}
    </Field>
  );
}

/** Indicadores do Negócio do aluno: a equipe preenche/edita (hot seat ou contato). */
function IndicatorsEditor({
  memberId,
  questions,
  answers,
}: {
  memberId: string;
  questions: DiagnosticQuestion[];
  answers: Answers;
}) {
  const action = useAdminAction();
  const indicators = questions.filter((q) => q.type === "moeda" || q.type === "percentual");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      indicators.map((q) => [q.id, typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""]),
    ),
  );

  if (indicators.length === 0) return null;

  const setVal = (id: string, value: string) => setValues((current) => ({ ...current, [id]: value }));

  return (
    <Card>
      <h2 className="text-lg font-bold text-(--text-main)">Indicadores do Negócio</h2>
      <p className="mt-1 text-sm font-medium text-(--text-muted)">
        Preenchidos pelo aluno na anamnese (opcional) ou pela equipe, após a call de hot seat ou
        contato. Entram na análise e na geração do plano, mas não na pontuação da maturidade.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {indicators.map((question) => {
          const value = values[question.id] || "";
          const isEmptyOption = question.emptyOption != null && value === question.emptyOption;
          const fieldId = `indicador-${question.id}`;
          return (
            <Field key={question.id} label={`${question.number}. ${question.label}`} htmlFor={fieldId}>
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
                  disabled={isEmptyOption || action.isPending}
                  value={isEmptyOption ? "" : value}
                  maxLength={20}
                  placeholder={question.type === "moeda" ? "0,00" : "0"}
                  onChange={(event) => setVal(question.id, event.target.value.replace(/[^\d.,]/g, ""))}
                  className={cn(question.type === "moeda" ? "pl-9" : "pr-8")}
                />
                {question.type === "percentual" && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-(--text-muted)">
                    %
                  </span>
                )}
              </div>
              {question.emptyOption && (
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs font-medium text-(--text-muted)">
                  <input
                    type="checkbox"
                    checked={isEmptyOption}
                    disabled={action.isPending}
                    onChange={(event) =>
                      setVal(question.id, event.target.checked ? question.emptyOption! : "")
                    }
                    className="h-4 w-4 accent-(--primary)"
                  />
                  {question.emptyOption}
                </label>
              )}
            </Field>
          );
        })}
      </div>
      <div className="mt-5">
        <Button
          onClick={() =>
            action.mutate({
              method: "patch",
              path: `/members/${memberId}/indicadores`,
              body: { answers: values },
              success: "Indicadores atualizados.",
            })
          }
          disabled={action.isPending}
        >
          Salvar indicadores
        </Button>
      </div>
    </Card>
  );
}

function PlansSection({ memberId, data }: { memberId: string; data: AdminMemberDetail }) {
  const action = useAdminAction();
  const { member } = data;
  const canOpenCycle = member.anamneseStatus === "submitted" && !member.pendingPlan;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-(--text-main)">Diagnóstico e planos</h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            Cada ciclo passa pela revisão antes de aparecer para o aluno.
          </p>
        </div>
        {canOpenCycle && (
          <Button
            variant="soft"
            disabled={action.isPending}
            onClick={async () => {
              try {
                const result = (await action.mutateAsync({
                  method: "post",
                  path: `/members/${memberId}/plans`,
                })) as { plan: { id: string } };
                navigate(`/adm/planos/${result.plan.id}`);
              } catch {
                // O aviso de erro já foi exibido.
              }
            }}
          >
            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Abrir novo ciclo
          </Button>
        )}
      </div>

      {data.plans.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-(--text-muted)">
          O plano entra na fila quando o aluno enviar a anamnese.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => navigate(`/adm/planos/${plan.id}`)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-(--border-subtle) p-3 text-left transition-colors hover:border-(--primary)"
              >
                <span className="text-sm font-bold text-(--text-main)">Ciclo {plan.cycle}</span>
                {plan.status === "approved" ? (
                  <Badge tone="success">Liberado em {formatDate(plan.approvedAt)}</Badge>
                ) : member.pendingPlan ? (
                  <DueBadge dueAt={member.pendingPlan.dueAt} />
                ) : (
                  <Badge tone="warning">Em revisão</Badge>
                )}
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-(--text-muted)" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {member.approvedPlan && member.approvedPlan.actionsTotal > 0 && (
        <p className="mt-4 text-sm text-(--text-muted)">
          No ciclo {member.approvedPlan.cycle}, o aluno concluiu{" "}
          <strong className="text-(--text-main)">
            {member.approvedPlan.actionsDone} de {member.approvedPlan.actionsTotal}
          </strong>{" "}
          ações.
        </p>
      )}
    </Card>
  );
}

const DELIVERY_STATUS: Record<EmailDeliveryStatus, { label: string; tone: "success" | "danger" | "neutral" }> = {
  sent: { label: "Enviado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  sending: { label: "Enviando", tone: "neutral" },
};

/** Um sinal de que o acesso chegou: feito (com data), pendente ou falhou. */
function Signal({
  state,
  label,
  detail,
}: {
  state: "done" | "pending" | "failed";
  label: string;
  detail: React.ReactNode;
}) {
  const Icon = state === "done" ? CheckCircle2 : state === "failed" ? XCircle : Clock;
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-(--border-subtle) p-3">
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          state === "done" ? "text-emerald-600" : state === "failed" ? "text-rose-600" : "text-(--text-soft)",
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-(--text-main)">
          {label}
          <span className="sr-only">: {state === "done" ? "sim" : state === "failed" ? "falhou" : "ainda não"}</span>
        </p>
        <p className="mt-0.5 text-xs font-medium text-(--text-muted)">{detail}</p>
      </div>
    </li>
  );
}

/**
 * Se os e-mails chegaram: sinais de que o acesso foi recebido (do mais fraco ao
 * mais forte) e o registro de cada e-mail enviado ao aluno.
 */
function DeliverySection({
  memberId,
  memberEmail,
  welcomeSentAt,
}: {
  memberId: string;
  memberEmail: string;
  welcomeSentAt: string | null;
}) {
  const query = useAdminMemberDelivery(memberId);
  const emails = query.data?.emails || [];
  const signals = query.data?.signals;
  // Registro mais novo primeiro: o primeiro "access" é o último e-mail de acesso.
  const lastAccess = emails.find((email) => email.kind === "access");

  let accessSignal: { state: "done" | "pending" | "failed"; detail: string };
  if (lastAccess?.status === "sent") {
    accessSignal = { state: "done", detail: `Em ${formatDateTimeBrasilia(lastAccess.sentAt)}` };
  } else if (lastAccess?.status === "failed") {
    accessSignal = { state: "failed", detail: `Falhou em ${formatDateTimeBrasilia(lastAccess.sentAt)}` };
  } else if (lastAccess?.status === "sending") {
    accessSignal = { state: "pending", detail: "Enviando agora" };
  } else if (welcomeSentAt) {
    accessSignal = { state: "done", detail: `Em ${formatDate(welcomeSentAt)} (antes do registro)` };
  } else {
    accessSignal = { state: "pending", detail: "Sem registro" };
  }

  return (
    <Card>
      <h2 className="text-lg font-bold text-(--text-main)">Entrega dos e-mails</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        Se o aluno recebeu o acesso. Os sinais abaixo valem mais do que “aberto”: quem abriu o link,
        criou a senha ou entrou recebeu o e-mail de verdade.
      </p>

      {query.isPending ? (
        <p className="mt-4 text-sm font-medium text-(--text-muted)">Carregando...</p>
      ) : query.isError || !signals ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-rose-600">Não foi possível carregar a entrega dos e-mails.</p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Signal state={accessSignal.state} label="E-mail de acesso enviado" detail={accessSignal.detail} />
            <Signal
              state={signals.accessLinkOpenedAt ? "done" : "pending"}
              label="Abriu o link de acesso"
              detail={
                signals.accessLinkOpenedAt ? `Em ${formatDateTimeBrasilia(signals.accessLinkOpenedAt)}` : "Ainda não"
              }
            />
            <Signal
              state={signals.hasPassword ? "done" : "pending"}
              label="Criou a senha"
              detail={signals.hasPassword ? "Sim" : "Ainda não"}
            />
            <Signal
              state={signals.firstLoginAt ? "done" : "pending"}
              label="Entrou na plataforma"
              detail={
                signals.firstLoginAt ? (
                  <>
                    Primeira vez em {formatDateTimeBrasilia(signals.firstLoginAt)}
                    {signals.lastLoginAt && (
                      <span className="block">Último acesso em {formatDateTimeBrasilia(signals.lastLoginAt)}</span>
                    )}
                  </>
                ) : (
                  "Ainda não"
                )
              }
            />
          </ul>

          {emails.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-(--border-strong) p-4 text-sm font-medium text-(--text-muted)">
              Nenhum e-mail registrado. O registro começou em 15/10/2026: envios anteriores não aparecem aqui.
            </p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-(--border-subtle) rounded-xl border border-(--border-subtle)">
                {emails.map((email) => (
                  <li key={email.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                    <span className="w-36 shrink-0 text-xs font-medium tabular-nums text-(--text-muted)">
                      {formatDateTimeBrasilia(email.sentAt)}
                    </span>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block text-sm font-bold text-(--text-main)">{email.label}</span>
                      {email.recipient && email.recipient.toLowerCase() !== memberEmail.toLowerCase() && (
                        <span className="block break-all text-xs text-(--text-muted)">Para {email.recipient}</span>
                      )}
                    </span>
                    <span className="rounded-full bg-(--bg-surface-muted) px-2.5 py-1 text-[11px] font-bold text-(--text-muted)">
                      {email.manual ? "Manual" : "Automático"}
                    </span>
                    <Badge tone={DELIVERY_STATUS[email.status]?.tone || "neutral"}>
                      {DELIVERY_STATUS[email.status]?.label || email.status}
                    </Badge>
                    {email.status === "sent" && (
                      <span className="text-xs font-medium text-(--text-muted)">
                        {email.openedAt
                          ? `Aberto em ${formatDateTimeBrasilia(email.openedAt)}${email.openCount > 1 ? ` (${email.openCount} vezes)` : ""}`
                          : "Não aberto"}
                      </span>
                    )}
                    {email.status === "failed" && (
                      <span className="basis-full text-xs font-medium text-rose-600">
                        {email.error ? `${email.error} ` : ""}
                        Reenvie em E-mails automáticos.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-(--text-muted)">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Enviado: o nosso servidor de e-mail aceitou (pode cair no spam). Falhou: foi recusado e
                  nada chegou. Aberto é uma estimativa: alguns aplicativos bloqueiam imagens e não
                  contam, e o Apple Mail pode marcar como aberto sozinho.
                </span>
              </p>
            </>
          )}

          <p className="mt-3 text-xs font-medium text-(--text-muted)">
            Os e-mails da Academy, da Formação Executiva e do CRM são enviados por cada plataforma; a
            situação deles aparece em Acessos nas outras plataformas.
          </p>
        </>
      )}
    </Card>
  );
}

/** E-mails automáticos do 360 que a equipe pode mandar de novo, um a um. */
function EmailsSection({ memberId }: { memberId: string }) {
  const query = useAdminMemberEmails(memberId);
  const action = useAdminAction();
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="text-lg font-bold text-(--text-main)">E-mails automáticos</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        Os e-mails que a plataforma manda sozinha. Se algum não chegou, envie de novo por aqui: o
        aluno recebe o mesmo e-mail. Os e-mails do CRM, da Formação Executiva e da Academy são
        enviados por cada plataforma, na criação da conta.
      </p>

      {query.isPending ? (
        <p className="mt-4 text-sm font-medium text-(--text-muted)">Carregando...</p>
      ) : query.isError ? (
        <p className="mt-4 text-sm font-medium text-rose-600">Não foi possível carregar os e-mails.</p>
      ) : (
        <ul className="mt-4 divide-y divide-(--border-subtle)">
          {query.data.map((email) => (
            <li key={email.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-bold text-(--text-main)">{email.label}</p>
                <p className="mt-0.5 text-xs text-(--text-muted)">{email.description}</p>
                <p className="mt-0.5 text-xs font-medium text-(--text-muted)">
                  {!email.available && email.reason
                    ? email.reason
                    : email.lastSentAt
                      ? `Último envio em ${formatDate(email.lastSentAt)}`
                      : null}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={!email.available || action.isPending}
                onClick={() => {
                  setSendingKey(email.key);
                  action.mutate(
                    { method: "post", path: `/members/${memberId}/emails`, body: { key: email.key } },
                    { onSettled: () => setSendingKey(null) },
                  );
                }}
              >
                {sendingKey === email.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const REMOTE_STATUS: Record<string, string> = {
  criado: "Conta criada",
  criado_sem_email: "Conta criada, mas o e-mail com a senha não saiu",
  reativado: "Conta reativada",
  renovado: "Validade renovada",
  ja_existia: "Já tinha conta com este e-mail",
  ja_cliente: "Já era cliente: nada foi alterado",
  bloqueado: "Acesso bloqueado",
  nao_encontrado: "Sem conta para bloquear",
  nao_gerenciado: "Conta não criada pelo 360: não foi bloqueada",
};

/** Acessos criados automaticamente na Academy, na Formação Executiva e no CRM. */
function ExternalAccountsSection({ memberId, data }: { memberId: string; data: AdminMemberDetail }) {
  const action = useAdminAction();
  const accounts = data.externalAccounts || [];
  const canRetry = accounts.some((account) => account.status === "failed" || account.status === "pending");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-(--text-main)">Acessos nas outras plataformas</h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            Criados sozinhos quando a assinatura é confirmada, renovados a cada pagamento e bloqueados
            quando ela termina.
          </p>
        </div>
        {canRetry && (
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ method: "post", path: `/members/${memberId}/external-accounts/retry` })
            }
          >
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        )}
      </div>

      <ul className="mt-4 divide-y divide-(--border-subtle)">
        {accounts.map((account) => (
          <li key={account.platform} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <span className="w-36 text-sm font-bold text-(--text-main)">{account.label}</span>
            {!account.configured && <Badge tone="neutral">Integração desligada</Badge>}
            {account.configured && account.status === null && <Badge tone="neutral">Nada pedido</Badge>}
            {account.configured && account.status === "pending" && <Badge tone="warning">Na fila</Badge>}
            {account.status === "failed" && <Badge tone="danger">Falhou</Badge>}
            {account.status === "ok" && (
              <Badge tone={account.desired === "blocked" ? "neutral" : "success"}>
                {REMOTE_STATUS[account.remoteStatus || ""] || account.remoteStatus || "Confirmado"}
              </Badge>
            )}
            {account.desired === "active" && account.validUntil && (
              <span className="text-xs text-(--text-muted)">válido até {formatDate(account.validUntil)}</span>
            )}
            {account.lastError && account.status !== "ok" && (
              <span className="basis-full text-xs font-medium text-rose-600">{account.lastError}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SupportSection({ data }: { data: AdminMemberDetail }) {
  return (
    <Card>
      <h2 className="text-lg font-bold text-(--text-main)">Suporte</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        A conversa do aluno no chat de suporte, só para leitura. Para responder, assuma o
        atendimento em Atendimento, quando o aluno pedir para falar com a equipe.
      </p>

      {data.messages.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-(--text-muted)">Nenhuma mensagem.</p>
      ) : (
        <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-xl border border-(--border-subtle) p-4">
          {data.messages.map((message) => (
            <MessageBubble key={message.id} message={message} viewer="team" />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccessRow({ memberId, access }: { memberId: string; access: AdminMemberAccess }) {
  const action = useAdminAction();
  const [accessUrl, setAccessUrl] = useState(access.accessUrl || "");
  const [note, setNote] = useState(access.note || "");
  const changed = accessUrl !== (access.accessUrl || "") || note !== (access.note || "");
  const fieldId = `acesso-${access.productId}`;

  return (
    <form
      className="grid gap-3 py-4 lg:grid-cols-[14rem_1fr_1fr_auto] lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        action.mutate({
          method: "put",
          path: `/members/${memberId}/access/${access.productId}`,
          body: { accessUrl, note },
        });
      }}
    >
      <div>
        <p className="text-sm font-bold text-(--text-main)">{access.productName}</p>
        <p className="mt-1 truncate text-xs text-(--text-muted)">
          {access.defaultUrl ? `Geral: ${access.defaultUrl}` : "Sem link geral"}
        </p>
      </div>
      <Field label="Link individual" htmlFor={`${fieldId}-url`}>
        <Input
          id={`${fieldId}-url`}
          type="url"
          placeholder="https://"
          value={accessUrl}
          onChange={(event) => setAccessUrl(event.target.value)}
        />
      </Field>
      <Field label="Recado para o aluno" htmlFor={`${fieldId}-note`}>
        <Input
          id={`${fieldId}-note`}
          placeholder="Ex.: código do ingresso"
          value={note}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={!changed || action.isPending}>
        Salvar
      </Button>
    </form>
  );
}
