import { Menu, MessageCircle, Search } from "lucide-react";
import { Input } from "../../../components/ui/input";

interface AppHeaderProps {
  /** A busca só aparece nas telas que listam entregáveis. */
  showSearch: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenMenu: () => void;
  /** Link do grupo exclusivo; sem ele o botão não aparece. */
  groupUrl?: string | null;
}

export function AppHeader({ showSearch, search, onSearchChange, onOpenMenu, groupUrl }: AppHeaderProps) {
  return (
    <header className="g360-no-print g360-app-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-(--text-main) hover:bg-(--bg-surface-muted) lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-1 justify-end">
        {showSearch && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
            <Input
              type="search"
              aria-label="Buscar conteúdos"
              placeholder="Buscar conteúdos..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-10 rounded-full pl-9"
            />
          </div>
        )}
      </div>

      {groupUrl && (
        <a
          href={groupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-(--primary) px-4 text-sm font-bold text-white transition-colors hover:bg-(--primary-hover)"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Entrar no grupo do WhatsApp</span>
          <span className="sm:hidden">Grupo</span>
        </a>
      )}

    </header>
  );
}
