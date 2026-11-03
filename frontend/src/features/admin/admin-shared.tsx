import { formatDate, formatDateTimeBrasilia } from "../../lib/format";
import { cn } from "../../lib/utils";
import { PLAN_NAMES, type PlanId } from "../../types/catalog";
import type { AdminMember } from "../../types/tracking";

const badgeClass =
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold";

const TONES = {
  neutral: "bg-(--bg-surface-muted) text-(--text-muted)",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-900",
  danger: "bg-rose-100 text-rose-900",
};

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn(badgeClass, TONES[tone])}>{children}</span>;
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  return (
    <span
      className={cn(
        badgeClass,
        plan === "premium" ? "bg-[#111111] text-white" : "bg-(--primary)/12 text-(--primary-text)",
      )}
    >
      {PLAN_NAMES[plan]}
    </span>
  );
}

/** Em que ponto da jornada o aluno está: primeiro acesso, anamnese, revisão, plano liberado. */
export function JourneyBadge({ member }: { member: AdminMember }) {
  if (member.accessStatus === "suspended") return <Badge tone="danger">Acesso suspenso</Badge>;
  if (!member.hasPassword) return <Badge tone="neutral">Não criou a senha</Badge>;
  if (member.pendingPlan) {
    return (
      <Badge tone="warning">
        {member.pendingPlan.cycle > 1 ? `Ciclo ${member.pendingPlan.cycle} em revisão` : "Plano em revisão"}
      </Badge>
    );
  }
  if (member.approvedPlan) return <Badge tone="success">Plano liberado</Badge>;
  if (member.anamneseStatus === "draft") return <Badge tone="neutral">Respondendo a anamnese</Badge>;
  return <Badge tone="neutral">Anamnese pendente</Badge>;
}

export type AccessDeliveryKey = "entered" | "password" | "opened" | "sent" | "sending" | "failed" | "unknown";

/**
 * Se o acesso chegou ao aluno, do sinal mais forte para o mais fraco: entrou
 * na plataforma, criou a senha, abriu o e-mail, e-mail enviado, falhou.
 */
export function accessDelivery(member: Pick<AdminMember, "hasPassword" | "delivery">): {
  key: AccessDeliveryKey;
  label: string;
  tone: keyof typeof TONES;
  title?: string;
} {
  const delivery = member.delivery;
  if (delivery?.firstLoginAt) {
    return {
      key: "entered",
      label: "Entrou",
      tone: "success",
      title: `Primeiro acesso em ${formatDateTimeBrasilia(delivery.firstLoginAt)}`,
    };
  }
  if (member.hasPassword) return { key: "password", label: "Senha criada", tone: "success" };
  if (delivery?.accessOpenedAt) {
    return {
      key: "opened",
      label: "E-mail aberto",
      tone: "warning",
      title: `Aberto em ${formatDateTimeBrasilia(delivery.accessOpenedAt)} (estimativa)`,
    };
  }
  if (delivery?.accessStatus === "sent") {
    return {
      key: "sent",
      label: "E-mail enviado",
      tone: "warning",
      title: `Enviado em ${formatDateTimeBrasilia(delivery.accessSentAt)}`,
    };
  }
  if (delivery?.accessStatus === "failed") {
    return {
      key: "failed",
      label: "E-mail falhou",
      tone: "danger",
      title: delivery.accessSentAt ? `Tentativa em ${formatDateTimeBrasilia(delivery.accessSentAt)}` : undefined,
    };
  }
  if (delivery?.accessStatus === "sending") return { key: "sending", label: "Enviando", tone: "neutral" };
  return { key: "unknown", label: "Sem registro", tone: "neutral" };
}

export function AccessDeliveryBadge({ member }: { member: Pick<AdminMember, "hasPassword" | "delivery"> }) {
  const status = accessDelivery(member);
  return (
    <span title={status.title}>
      <Badge tone={status.tone}>{status.label}</Badge>
    </span>
  );
}

/** Prazo da revisão (72 horas úteis): avisa quando está perto ou já passou. */
export function DueBadge({ dueAt }: { dueAt: string }) {
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / 3600000;

  if (hoursLeft < 0) return <Badge tone="danger">Prazo vencido em {formatDate(dueAt)}</Badge>;
  if (hoursLeft < 24) return <Badge tone="warning">Vence em {formatDate(dueAt)}</Badge>;
  return <Badge tone="neutral">Prazo: {formatDate(dueAt)}</Badge>;
}
