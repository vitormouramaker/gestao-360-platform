import { cn } from "../../lib/utils";

interface Logo360Props {
  /** Nome do plano embaixo da marca (ESSENCIAL / PREMIUM). */
  planLabel?: string;
  className?: string;
}

/**
 * Marca "Gestão 360°" desenhada em SVG. O texto usa a cor corrente
 * (currentColor) e o verde vem do tema.
 */
export function Logo360({ planLabel, className }: Logo360Props) {
  return (
    <svg
      viewBox="0 0 212 130"
      role="img"
      aria-label={planLabel ? `Gestão 360° ${planLabel}` : "Gestão 360°"}
      className={cn("g360-brand-font h-auto w-44", className)}
    >
      <circle cx="106" cy="62" r="52" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.18" />
      <path
        d="M106 10A52 52 0 1 1 60 86"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="60" cy="86" r="3.6" fill="var(--primary)" />
      <text
        x="106"
        y="70"
        fontSize="40"
        fontWeight="800"
        textAnchor="middle"
        fill="currentColor"
      >
        360°
      </text>
      <text
        x="106"
        y="90"
        fontSize="11"
        fontWeight="600"
        letterSpacing="4.2"
        textAnchor="middle"
        fill="currentColor"
        opacity="0.85"
      >
        GESTÃO
      </text>
      {planLabel && (
        <text
          x="106"
          y="126"
          fontSize="8.5"
          fontWeight="600"
          letterSpacing="3.2"
          textAnchor="middle"
          fill="var(--primary)"
        >
          {planLabel.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
