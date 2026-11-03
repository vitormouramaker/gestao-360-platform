export type PlanId = "essencial" | "premium";

export type ProductArtId = "orbit" | "path" | "layers" | "compass";

export type ProductIconId =
  | "chart"
  | "monitor"
  | "graduation"
  | "book"
  | "chat"
  | "users"
  | "video"
  | "calendar"
  | "file"
  | "settings"
  | "gem"
  | "ticket";

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  plan: PlanId;
  icon: ProductIconId | null;
  art: ProductArtId | null;
  /** O plano da pessoa não cobre este entregável. */
  locked: boolean;
  /** Tela da própria plataforma que o entregável abre (ex.: "diagnostic"). */
  page: string | null;
  /** Endereço do produto; vem vazio quando bloqueado ou ainda não publicado. */
  accessUrl: string | null;
  /** Recado da equipe sobre o acesso individual (ex.: número do ingresso). */
  accessNote: string | null;
}

export interface Catalog {
  plan: PlanId;
  planName: string;
  plans: Array<{ id: PlanId; name: string; price: string }>;
  /** Renovação nos próximos dias; null fora dessa janela ou sem data conhecida. */
  renewal?: { renewsAt: string } | null;
  products: Product[];
  upgrade: { checkoutUrl: string | null };
  support: { whatsapp: string | null };
}

export const PLAN_NAMES: Record<PlanId, string> = {
  essencial: "Plano",
  premium: "Assinatura Anual",
};
