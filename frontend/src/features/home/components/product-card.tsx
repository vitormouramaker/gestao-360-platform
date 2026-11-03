import {
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  FileText,
  Gem,
  GraduationCap,
  Lock,
  MessageCircle,
  Monitor,
  Settings,
  Ticket,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import type { Product, ProductIconId } from "../../../types/catalog";
import { ProductArt } from "./product-art";

interface ProductCardProps {
  product: Product;
  onOpen: (product: Product) => void;
}

const ICONS: Record<ProductIconId, LucideIcon> = {
  chart: TrendingUp,
  monitor: Monitor,
  graduation: GraduationCap,
  book: BookOpen,
  chat: MessageCircle,
  users: Users,
  video: Video,
  calendar: CalendarCheck,
  file: FileText,
  settings: Settings,
  gem: Gem,
  ticket: Ticket,
};

/** Card de um entregável. Bloqueado, mostra o cadeado e abre a oferta do Premium. */
export function ProductCard({ product, onOpen }: ProductCardProps) {
  const emBreve = !product.locked && !product.accessUrl && !product.page && !product.accessNote;
  const Icon = (product.icon && ICONS[product.icon]) || null;

  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      data-locked={product.locked}
      aria-label={
        product.locked
          ? `${product.name}: bloqueado, disponível na Assinatura Anual`
          : emBreve
            ? `${product.name}: em breve`
            : `Abrir ${product.name}`
      }
      className="g360-product-card group relative h-96 w-64 shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl border border-(--border-subtle) bg-[#0d0d0d] text-left shadow-(--shadow-soft) transition-shadow hover:shadow-(--shadow-elevated) sm:h-[26rem] sm:w-72"
    >
      <ProductArt
        art={product.art}
        className={cn(
          "g360-product-art absolute inset-0 h-full w-full",
          product.locked && "opacity-35 grayscale",
        )}
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-black/10" />

      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        {Icon ? (
          <span
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full text-white ring-1 ring-white/25 backdrop-blur",
              product.locked ? "bg-black/60" : "bg-(--primary)",
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <span />
        )}

        {product.locked ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/25 backdrop-blur">
            <Lock className="h-4 w-4" />
          </span>
        ) : emBreve ? (
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur">
            Em breve
          </span>
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#132b40]">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3 className="text-lg font-bold leading-tight text-white sm:text-xl">{product.name}</h3>
        {product.description && (
          <p className="mt-2 text-[13px] font-medium leading-snug text-white/85">
            {product.description}
          </p>
        )}
      </div>
    </button>
  );
}
