import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { formatDate } from "../../../lib/format";
import { authConfig, getErrorMessage } from "../../../lib/http";
import type { CalendarEvent, EventTicket } from "../../../types/tracking";

interface TicketModalProps {
  event: CalendarEvent;
  onClose: () => void;
}

/**
 * Ingresso do evento presencial, com o QR code que a equipe lê na entrada.
 * O conteúdo do QR vem do servidor: o formato do sistema de credenciamento
 * quando ele está ligado, ou o endereço de conferência do /adm.
 */
export function TicketModal({ event, onClose }: TicketModalProps) {
  const [qr, setQr] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ticket", event.id],
    queryFn: async () =>
      (await axios.get<{ ticket: EventTicket }>(`/api/events/${event.id}/ticket`, authConfig())).data.ticket,
    retry: false,
  });
  const ticket = query.data;

  // A biblioteca do QR code só é carregada quando alguém abre um ingresso.
  useEffect(() => {
    if (!ticket) return;
    let active = true;
    void import("qrcode").then(async (library) => {
      const image = await library.toDataURL(ticket.qrContent, {
        width: 440,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      if (active) setQr(image);
    });
    return () => {
      active = false;
    };
  }, [ticket]);

  // Com o ingresso aberto, "Imprimir" leva ao papel só a cópia de impressão
  // (regra em index.css). Fora daqui, a impressão do resto do app não muda.
  useEffect(() => {
    document.documentElement.classList.add("g360-printing-ticket");
    return () => document.documentElement.classList.remove("g360-printing-ticket");
  }, []);

  const period =
    event.endsAt && formatDate(event.endsAt) !== formatDate(event.startsAt)
      ? `${formatDate(event.startsAt)} a ${formatDate(event.endsAt)}`
      : formatDate(event.startsAt);

  const ticketBody = ticket && (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">Gestão 360°</p>
      <h3 className="mt-1 text-lg font-extrabold text-(--text-main)">{ticket.event.title}</h3>
      <p className="mt-1 text-sm text-(--text-muted)">
        {period}
        {ticket.event.location ? ` · ${ticket.event.location}` : ""}
      </p>

      <div className="mx-auto mt-4 grid h-56 w-56 place-items-center rounded-2xl bg-white p-3">
        {qr ? (
          <img src={qr} alt={`QR code do ingresso ${ticket.code}`} className="h-full w-full" />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        )}
      </div>

      <p className="mt-4 text-sm font-bold text-(--text-main)">{ticket.holderName}</p>
      <p className="mt-1 font-mono text-lg font-bold tracking-widest text-(--text-main)">{ticket.code}</p>

      <p className="mt-4 text-xs font-medium leading-snug text-(--text-muted)">
        Ingresso pessoal. Apresente o QR code na entrada.
      </p>

      {/* Cores fixas: o aviso precisa se destacar igual na tela escura e no papel. */}
      <div
        role="note"
        className="mt-4 flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-left text-amber-900"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm leading-snug">
          <strong className="block">Este ingresso depende da sua assinatura.</strong>
          Se a assinatura for cancelada antes do evento, ou estiver cancelada ou em atraso na data
          do evento, o ingresso deixa de valer e a entrada é recusada.
        </p>
      </div>
    </div>
  );

  return (
    <Modal
      open
      title="Meu ingresso"
      onClose={onClose}
      footer={
        // Sem o QR code pronto, a folha sairia com o quadro vazio.
        ticket && (
          <Button variant="secondary" disabled={!qr} onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        )
      }
    >
      {query.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-(--text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          Abrindo o ingresso...
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {getErrorMessage(query.error, "Não foi possível abrir o ingresso.")}
        </p>
      )}

      {ticketBody}
      {/* Cópia fora da janela: é ela que sai na impressão, sem fundo nem botões. */}
      {ticketBody && createPortal(<div className="g360-ticket-print">{ticketBody}</div>, document.body)}
    </Modal>
  );
}
