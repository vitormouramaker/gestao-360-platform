import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Headset, Loader2, MessageCircle, Send, X } from "lucide-react";
import { useFecharComEsc } from "../../../lib/use-fechar-com-esc";
import { authConfig, getErrorMessage } from "../../../lib/http";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/use-auth-store";
import { toast } from "../../../store/use-toast-store";
import type { SupportConversation, SupportMessage } from "../../../types/tracking";

interface SupportChatProps {
  onClose: () => void;
}

interface MessageBubbleProps {
  message: SupportMessage;
  viewer: "member" | "team";
  /** WhatsApp do time: aparece como botão nas respostas que mandam falar com ele. */
  whatsappUrl?: string | null;
  /** Pede o atendimento da equipe pelo chat; sem isto a opção não aparece. */
  onRequestTeam?: () => void;
  requesting?: boolean;
  /** Recado no lugar da opção do chat (ex.: fora do horário de atendimento). */
  teamNote?: string | null;
}

// Enquanto o cliente está na fila ou em atendimento, busca mensagens novas.
const TICKET_REFRESH_MS = 5000;

export function MessageBubble({
  message,
  viewer,
  whatsappUrl,
  onRequestTeam,
  requesting,
  teamNote,
}: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <li className="px-4 text-center text-xs font-medium leading-snug text-(--text-muted)">{message.content}</li>
    );
  }

  // A mensagem fica à direita quando é de quem está olhando.
  const mine = viewer === "member" ? message.role === "user" : message.role === "team";
  const author =
    message.role === "user" ? "Aluno" : message.role === "team" ? "Equipe Gestão 360" : "Assistente";

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          mine
            ? "rounded-br-md bg-(--primary) text-white"
            : "rounded-bl-md bg-(--bg-surface-muted) text-(--text-main)",
        )}
      >
        {!mine && (
          <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-(--text-muted)">
            {author}
          </p>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.handoff && viewer === "member" && (whatsappUrl || onRequestTeam || teamNote) && (
          <div className="mt-3 flex flex-col gap-2">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-(--primary) px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-(--primary-hover)"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Falar com a equipe pelo WhatsApp
              </a>
            )}
            {onRequestTeam && (
              <button
                type="button"
                onClick={onRequestTeam}
                disabled={requesting}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--primary) px-4 py-2 text-sm font-bold text-(--text-main) transition-colors hover:bg-(--primary)/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Headset className="h-4 w-4" aria-hidden="true" />
                )}
                Falar com a equipe pelo chat
              </button>
            )}
            {teamNote && <p className="text-xs font-medium text-(--text-muted)">{teamNote}</p>}
          </div>
        )}
        {message.handoff && viewer === "team" && (
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-(--text-muted)">
            Opções de falar com o time oferecidas
          </p>
        )}
      </div>
    </li>
  );
}

/** Chat de suporte dentro da plataforma, aberto pelo botão do canto da tela. */
export function SupportChat({ onClose }: SupportChatProps) {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const queryKey = ["support", userId];
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useFecharComEsc(true, onClose);

  const query = useQuery({
    queryKey,
    // Em atendimento humano as respostas chegam a qualquer momento.
    refetchInterval: (current) => (current.state.data?.ticket ? TICKET_REFRESH_MS : false),
    queryFn: async () =>
      (await axios.get<SupportConversation>("/api/support/messages", authConfig())).data,
  });

  const send = useMutation({
    mutationFn: async (content: string) =>
      (
        await axios.post<{ message: SupportMessage; reply: SupportMessage | null }>(
          "/api/support/messages",
          { content },
          authConfig(),
        )
      ).data,
    onSuccess: (data) => {
      setText("");
      queryClient.setQueryData<SupportConversation>(queryKey, (current) =>
        current
          ? { ...current, messages: [...current.messages, data.message, ...(data.reply ? [data.reply] : [])] }
          : current,
      );
    },
    onError: (error) =>
      toast.error("Não foi possível enviar a mensagem.", {
        message: getErrorMessage(error, "Tente novamente."),
      }),
  });

  // Entrar na fila ou sair dela; a conversa é recarregada com os avisos novos.
  const ticketAction = useMutation({
    mutationFn: async (path: "ticket" | "ticket/cancel") =>
      (await axios.post(`/api/support/${path}`, {}, authConfig())).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) =>
      toast.error("Não foi possível concluir.", { message: getErrorMessage(error, "Tente novamente.") }),
  });

  const messages = query.data?.messages || [];
  const whatsappUrl = query.data?.whatsappUrl;
  const ticket = query.data?.ticket || null;
  const chatSupportOpen = query.data?.chatSupportOpen ?? false;
  // As opções de contato aparecem só na última resposta que as ofereceu.
  const lastHandoffId = [...messages].reverse().find((message) => message.handoff)?.id;

  // Mantém a conversa rolada até a última mensagem.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const content = text.trim();
    if (!content || send.isPending) return;
    send.mutate(content);
  };

  return (
    <div
      role="dialog"
      aria-label="Suporte"
      className="g360-no-print fixed inset-x-0 bottom-0 z-[70] flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-(--border-subtle) bg-(--bg-elevated) shadow-(--shadow-elevated) sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[34rem] sm:w-96 sm:rounded-3xl"
    >
      <div className="flex items-center justify-between gap-3 bg-(--primary) px-5 py-4 text-white">
        <div>
          <h2 className="text-base font-bold">Suporte Gestão 360</h2>
          <p className="text-xs font-medium text-white/90">
            {ticket ? "Atendimento com a equipe Gestão 360." : "Assistente virtual da plataforma e do programa."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar suporte"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul ref={listRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
        {query.isPending && (
          <li className="flex items-center gap-2 text-sm text-(--text-muted)">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conversa...
          </li>
        )}
        {query.isError && (
          <li role="alert" className="text-sm font-medium text-rose-600">
            Não foi possível carregar a conversa.
          </li>
        )}
        {query.data && messages.length === 0 && (
          <li className="rounded-2xl bg-(--bg-surface-muted) p-4 text-sm text-(--text-main)">
            Olá! Escreva a sua dúvida sobre a plataforma, os entregáveis ou o calendário.
          </li>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            viewer="member"
            whatsappUrl={!ticket && message.id === lastHandoffId ? whatsappUrl : null}
            onRequestTeam={
              !ticket && chatSupportOpen && message.id === lastHandoffId
                ? () => ticketAction.mutate("ticket")
                : undefined
            }
            requesting={ticketAction.isPending}
            teamNote={
              !ticket && !chatSupportOpen && message.id === lastHandoffId && query.data
                ? `Atendimento da equipe pelo chat: ${query.data.supportHours}.`
                : null
            }
          />
        ))}
        {send.isPending && !ticket && (
          <li role="status" className="flex items-center gap-2 text-sm text-(--text-muted)">
            <Loader2 className="h-4 w-4 animate-spin" />
            A assistente está respondendo...
          </li>
        )}
      </ul>

      {ticket ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 border-t border-(--border-subtle) px-4 py-2 text-[11px] font-medium leading-snug text-(--text-muted)"
        >
          {ticket.status === "active"
            ? `Você está falando com ${ticket.adminName || "a equipe Gestão 360"}.`
            : "Você está na fila. Uma pessoa da equipe vai responder por aqui."}
          {ticket.status === "waiting" && (
            <button
              type="button"
              disabled={ticketAction.isPending}
              onClick={() => ticketAction.mutate("ticket/cancel")}
              className="cursor-pointer font-bold text-(--text-main) underline underline-offset-2 disabled:opacity-50"
            >
              Sair da fila
            </button>
          )}
        </p>
      ) : (
        <p className="border-t border-(--border-subtle) px-4 py-2 text-[11px] font-medium leading-snug text-(--text-muted)">
          A assistente é uma inteligência artificial: pode errar ou não saber responder. Na dúvida,
          confirme com o nosso time.
        </p>
      )}

      <form
        className="flex items-end gap-2 px-3 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          aria-label="Sua mensagem"
          placeholder="Escreva a sua mensagem..."
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter envia; Shift+Enter quebra a linha.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="g360-ui-input max-h-32 min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          aria-label="Enviar mensagem"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-(--primary) text-white transition-colors hover:bg-(--primary-hover) disabled:pointer-events-none disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
