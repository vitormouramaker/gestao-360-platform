import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";

interface ProductCarouselProps {
  /** Nome da faixa para leitores de tela. */
  label: string;
  children: React.ReactNode;
}

/**
 * Faixa horizontal de cards. Rola com o dedo, com a roda/trackpad ou pelas
 * setas, que só aparecem quando há mais cards para aquele lado.
 */
export function ProductCarousel({ label, children }: ProductCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollLeft(track.scrollLeft > 4);
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateArrows();
    const observer = new ResizeObserver(updateArrows);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateArrows, children]);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        onScroll={updateArrows}
        className="g360-carousel-track -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 sm:-mx-8 sm:scroll-px-8 sm:px-8 2xl:-mx-12 2xl:scroll-px-12 2xl:px-12"
      >
        {children}
      </div>

      {[
        { direction: -1 as const, visible: canScrollLeft, label: "Ver anteriores", Icon: ChevronLeft },
        { direction: 1 as const, visible: canScrollRight, label: "Ver próximos", Icon: ChevronRight },
      ].map(({ direction, visible, label: arrowLabel, Icon }) => (
        <button
          key={direction}
          type="button"
          onClick={() => scrollByPage(direction)}
          aria-label={arrowLabel}
          tabIndex={visible ? 0 : -1}
          className={cn(
            "absolute top-[calc(50%-0.5rem)] z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white text-[#132b40] shadow-lg ring-1 ring-black/10 transition-opacity hover:bg-slate-100 sm:grid",
            direction === -1 ? "-left-3" : "-right-3",
            visible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <Icon className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
