import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { authConfig, getErrorMessage } from "../../lib/http";
import { toast } from "../../store/use-toast-store";
import type {
  ActivityAudience,
  AdminActivity,
  AdminAiUsage,
  AdminEventTicket,
  AdminInsights,
  AdminKnowledge,
  AdminMember,
  AdminMemberDeliveryDetail,
  AdminMemberDetail,
  AdminOnboardingCall,
  AdminOverview,
  AdminPlanDetail,
  AdminPlanListItem,
  AdminProduct,
  AdminSettings,
  AdminSupportFlags,
  AdminTeamArea,
  AdminTeamMember,
  AdminTicketDetail,
  AdminTickets,
  CalendarEvent,
  EventType,
  HublaEvent,
  Tool,
} from "../../types/tracking";

/** Chamadas do painel /adm. Toda consulta fica sob a chave ["admin", ...]. */

async function get<T>(path: string) {
  return (await axios.get<T>(`/api/admin${path}`, authConfig())).data;
}

export function useAdminOverview() {
  return useQuery({ queryKey: ["admin", "overview"], queryFn: () => get<AdminOverview>("/overview") });
}

export function useAdminMembers() {
  return useQuery({
    queryKey: ["admin", "members"],
    queryFn: async () => (await get<{ members: AdminMember[] }>("/members")).members,
  });
}

export function useAdminMember(memberId: string) {
  return useQuery({
    queryKey: ["admin", "members", memberId],
    queryFn: () => get<AdminMemberDetail>(`/members/${memberId}`),
  });
}

/** E-mail automático que a equipe pode mandar de novo para o aluno. */
export interface AdminMemberEmail {
  key: string;
  label: string;
  description: string;
  lastSentAt: string | null;
  available: boolean;
  reason: string | null;
}

export function useAdminMemberEmails(memberId: string) {
  return useQuery({
    queryKey: ["admin", "members", memberId, "emails"],
    queryFn: async () => (await get<{ emails: AdminMemberEmail[] }>(`/members/${memberId}/emails`)).emails,
  });
}

/** Registro dos e-mails enviados ao aluno e os sinais de que o acesso chegou. */
export function useAdminMemberDelivery(memberId: string) {
  return useQuery({
    queryKey: ["admin", "members", memberId, "delivery"],
    queryFn: () => get<AdminMemberDeliveryDetail>(`/members/${memberId}/delivery`),
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: async () => (await get<{ plans: AdminPlanListItem[] }>("/plans")).plans,
  });
}

export function useAdminPlan(planId: string) {
  return useQuery({
    queryKey: ["admin", "plans", planId],
    queryFn: () => get<AdminPlanDetail>(`/plans/${planId}`),
    // O editor guarda o texto em edição: recarregar sozinho apagaria o que a pessoa digitou.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // Exceção: enquanto a IA escreve o rascunho não há edição, então a tela
    // confere de tempos em tempos até ele ficar pronto.
    refetchInterval: (query) =>
      ["queued", "generating"].includes(query.state.data?.plan.draftStatus || "") ? 5000 : false,
  });
}

export function useAdminActivities() {
  return useQuery({
    queryKey: ["admin", "activities"],
    queryFn: () =>
      get<{ activities: AdminActivity[]; audiences: Array<{ id: ActivityAudience; label: string }> }>(
        "/activities",
      ),
  });
}

export function useAdminKnowledge() {
  return useQuery({
    queryKey: ["admin", "knowledge"],
    queryFn: () => get<AdminKnowledge>("/knowledge"),
  });
}

export function useAdminSupportFlags(filters: { days: number; category: string; memberId: string }) {
  return useQuery({
    queryKey: ["admin", "support-flags", filters],
    queryFn: () =>
      get<AdminSupportFlags>(
        `/support/flags?days=${filters.days}&category=${encodeURIComponent(filters.category)}&memberId=${encodeURIComponent(filters.memberId)}`,
      ),
    // Trocar um filtro não esvazia a tela enquanto a nova lista chega.
    placeholderData: (previous) => previous,
  });
}

export function useAdminInsights() {
  return useQuery({
    queryKey: ["admin", "insights"],
    queryFn: () => get<AdminInsights>("/insights"),
    // Enquanto a IA escreve um relatório, a tela confere até ele ficar pronto.
    refetchInterval: (query) =>
      query.state.data?.insights.some((insight) => insight.status === "generating") ? 5000 : false,
  });
}

// Atendimento ao vivo: as duas consultas se atualizam sozinhas.
const TICKETS_REFRESH_MS = 5000;

export function useAdminTickets() {
  return useQuery({
    queryKey: ["admin", "tickets"],
    queryFn: () => get<AdminTickets>("/tickets"),
    refetchInterval: TICKETS_REFRESH_MS,
  });
}

export function useAdminTicket(ticketId: string) {
  return useQuery({
    queryKey: ["admin", "tickets", ticketId],
    queryFn: () => get<AdminTicketDetail>(`/tickets/${ticketId}`),
    refetchInterval: TICKETS_REFRESH_MS,
    // Assumido por outra pessoa vira 403: não adianta insistir.
    retry: false,
  });
}

export function useAdminEventTicket(code: string) {
  return useQuery({
    queryKey: ["admin", "event-ticket", code],
    queryFn: async () =>
      (await get<{ ticket: AdminEventTicket }>(`/event-tickets/${encodeURIComponent(code)}`)).ticket,
    retry: false,
  });
}

export function useAdminTools() {
  return useQuery({
    queryKey: ["admin", "tools"],
    queryFn: () => get<{ tools: Tool[]; categories: Array<{ id: string; label: string }> }>("/tools"),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => (await get<{ settings: AdminSettings }>("/settings")).settings,
  });
}

export function useAdminAiUsage() {
  return useQuery({ queryKey: ["admin", "ai-usage"], queryFn: () => get<AdminAiUsage>("/ai-usage") });
}

export function useAdminEvents() {
  return useQuery({
    queryKey: ["admin", "events"],
    queryFn: () =>
      get<{ events: CalendarEvent[]; types: Array<{ id: EventType; label: string }> }>("/events"),
  });
}

export function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => (await get<{ products: AdminProduct[] }>("/products")).products,
  });
}

export function useAdminOnboardingCalls() {
  return useQuery({
    queryKey: ["admin", "onboarding-calls"],
    queryFn: async () => (await get<{ calls: AdminOnboardingCall[] }>("/onboarding-calls")).calls,
    // Os alunos agendam a qualquer momento: a lista se atualiza ao voltar para a aba.
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}

export function useAdminTeam() {
  return useQuery({
    queryKey: ["admin", "team"],
    queryFn: () => get<{ admins: AdminTeamMember[]; areas: AdminTeamArea[] }>("/team"),
  });
}

export function useAdminHublaEvents() {
  return useQuery({
    queryKey: ["admin", "hubla"],
    queryFn: () => get<{ configured: boolean; events: HublaEvent[] }>("/hubla/events"),
  });
}

interface AdminAction {
  method: "post" | "patch" | "put" | "delete";
  path: string;
  body?: unknown;
  /** Aviso de sucesso fixo. Sem ele, usa a mensagem que a API devolver. */
  success?: string;
  /** true = não mostra aviso de sucesso. */
  silent?: boolean;
}

/**
 * Executa uma alteração do painel: chama a API, recarrega os dados do painel e
 * avisa o resultado. O erro também é devolvido para quem chamou (mutateAsync).
 */
export function useAdminAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ method, path, body }: AdminAction) =>
      (await axios.request({ method, url: `/api/admin${path}`, data: body, ...authConfig() })).data,
    onSuccess: async (data, action) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      // O admin também pode ver a área do aluno: os dados de lá ficam em dia.
      for (const key of ["catalog", "events", "activities", "plan", "support", "tools", "onboarding"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      const message = action.success || (data as { message?: string } | undefined)?.message;
      if (message && !action.silent) toast.success(message);
    },
    onError: (error) =>
      toast.error("Não foi possível concluir.", {
        message: getErrorMessage(error, "Tente novamente."),
      }),
  });
}
