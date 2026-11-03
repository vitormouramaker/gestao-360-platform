import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { SupportChat } from "./support-chat";

/**
 * Botão do suporte no canto da tela. Fica em qualquer tela do app e abre o
 * chat de suporte dentro da própria plataforma.
 */
export function SupportBubble() {
  const [open, setOpen] = useState(false);

  if (open) {
    return <SupportChat onClose={() => setOpen(false)} />;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Abrir o suporte"
      title="Suporte"
      className="g360-no-print g360-safe-bottom fixed bottom-5 right-5 z-[60] grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-(--primary) text-white shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-(--primary-hover)"
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  );
}
