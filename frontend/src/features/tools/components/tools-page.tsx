import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Download } from "lucide-react";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { authConfig } from "../../../lib/http";
import { useAuthStore } from "../../../store/use-auth-store";
import type { Tool } from "../../../types/tracking";

/** Ferramentas e modelos de apoio para baixar, agrupados por assunto. */
export function ToolsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ["tools", userId],
    queryFn: async () =>
      (
        await axios.get<{ tools: Tool[]; categories: Array<{ id: string; label: string }> }>(
          "/api/catalog/tools",
          authConfig(),
        )
      ).data,
  });

  const tools = query.data?.tools || [];
  const groups = (query.data?.categories || [])
    .map((category) => ({ ...category, tools: tools.filter((tool) => tool.category === category.id) }))
    .filter((group) => group.tools.length > 0);

  return (
    <Page
      title="Ferramentas e modelos"
      subtitle="Planilhas, modelos e checklists para colocar o plano em prática. Baixe, adapte à sua empresa e use."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar as ferramentas."
      />

      {query.data && tools.length === 0 && (
        <EmptyState>Os materiais aparecem aqui assim que forem publicados.</EmptyState>
      )}

      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`ferramentas-${group.id}`}>
            <h2 id={`ferramentas-${group.id}`} className="mb-4 text-lg font-bold text-(--text-main)">
              {group.label}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {group.tools.map((tool) => (
                <Card key={tool.id} className="flex flex-col gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-(--text-main)">{tool.title}</h3>
                    {tool.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-muted)">{tool.description}</p>
                    )}
                  </div>
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-(--primary) px-4 text-sm font-bold text-white transition-colors hover:bg-(--primary-hover)"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Baixar
                    <span className="sr-only">: {tool.title}</span>
                  </a>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
