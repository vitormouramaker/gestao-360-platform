import { useId } from "react";
import type { ProductArtId } from "../../../types/catalog";

interface ProductArtProps {
  art: ProductArtId | null;
  className?: string;
}

/**
 * Ilustração abstrata do card, nas cores do plano em tela. Provisória: cada
 * entregável pode ganhar a sua própria capa depois.
 */
export function ProductArt({ art, className }: ProductArtProps) {
  const id = useId();
  const glow = `${id}-glow`;
  const fade = `${id}-fade`;

  return (
    <svg
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id={glow} cx="30%" cy="25%" r="80%">
          <stop offset="0%" stopColor="var(--art-light)" stopOpacity="0.9" />
          <stop offset="55%" stopColor="var(--art-mid)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--art-base)" stopOpacity="0.2" />
        </radialGradient>
        <linearGradient id={fade} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <rect width="320" height="240" fill="var(--art-base)" />

      {art === "path" && (
        <>
          <circle cx="60" cy="70" r="90" fill={`url(#${glow})`} opacity="0.5" />
          <path
            d="M330 60C250 70 250 120 190 128S110 150 150 190s120 30 190 60V60z"
            fill={`url(#${fade})`}
          />
          <path
            d="M330 74C262 84 258 128 196 138s-74 20 -40 50s110 26 174 54"
            fill="none"
            stroke="var(--art-light)"
            strokeWidth="1.2"
            opacity="0.7"
          />
          <circle cx="196" cy="138" r="5" fill="var(--art-light)" />
        </>
      )}

      {art === "layers" && (
        <>
          <rect x="150" y="26" width="120" height="150" rx="10" fill={`url(#${glow})`} opacity="0.35" />
          <rect x="112" y="56" width="120" height="150" rx="10" fill={`url(#${fade})`} opacity="0.55" />
          <rect x="74" y="92" width="120" height="150" rx="10" fill={`url(#${fade})`} />
          <rect
            x="150"
            y="26"
            width="120"
            height="150"
            rx="10"
            fill="none"
            stroke="var(--art-light)"
            strokeWidth="1"
            opacity="0.5"
          />
        </>
      )}

      {art === "compass" && (
        <>
          <circle cx="130" cy="210" r="120" fill={`url(#${glow})`} opacity="0.6" />
          <circle cx="210" cy="96" r="78" fill="none" stroke="var(--art-light)" strokeWidth="1" opacity="0.6" />
          <path d="M232 62l44 78l-92 4z" fill={`url(#${fade})`} />
        </>
      )}

      {(art === "orbit" || !art) && (
        <>
          <circle cx="70" cy="170" r="130" fill={`url(#${glow})`} opacity="0.7" />
          <circle cx="236" cy="34" r="84" fill={`url(#${fade})`} />
          <circle cx="150" cy="60" r="118" fill="none" stroke="var(--art-light)" strokeWidth="1" opacity="0.45" />
        </>
      )}
    </svg>
  );
}
