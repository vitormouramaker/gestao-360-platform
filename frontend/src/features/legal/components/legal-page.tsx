import privacidade from "../../../content/privacidade.md?raw";
import termos from "../../../content/termos.md?raw";
import { Logo360 } from "../../../components/brand/logo-360";
import { navigate } from "../../../lib/navigation";

const DOCUMENTS = { termos, privacidade };

type Block =
  | { kind: "title" | "heading" | "subheading" | "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[][] };

/** Lê o texto do documento (títulos, listas, tabelas e parágrafos) em blocos. */
function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        if (!/^\|[\s\-|]+\|$/.test(lines[index])) {
          rows.push(lines[index].slice(1, -1).split("|").map((cell) => cell.trim()));
        }
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: "table", rows });
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: "list", items });
    } else if (line.startsWith("### ")) {
      blocks.push({ kind: "subheading", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "title", text: line.slice(2) });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

interface LegalPageProps {
  document: "termos" | "privacidade";
}

/** Termos de Uso e Política de Privacidade: páginas públicas, sem login. */
export function LegalPage({ document }: LegalPageProps) {
  const blocks = parse(DOCUMENTS[document]);
  const other = document === "termos" ? "privacidade" : "termos";

  return (
    <div className="g360-auth-screen min-h-dvh px-4 py-10">
      <div className="g360-auth-card mx-auto w-full max-w-3xl rounded-3xl border p-6 sm:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Logo360 className="w-32 text-(--text-main)" />
          <nav aria-label="Documentos" className="flex flex-wrap gap-4 text-sm font-bold">
            <a
              href={other === "termos" ? "/termos" : "/privacidade"}
              onClick={(event) => {
                event.preventDefault();
                navigate(other === "termos" ? "/termos" : "/privacidade");
                window.scrollTo({ top: 0 });
              }}
              className="text-(--primary-text) underline-offset-2 hover:underline"
            >
              {other === "termos" ? "Termos de Uso" : "Política de Privacidade"}
            </a>
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
              className="text-(--primary-text) underline-offset-2 hover:underline"
            >
              Ir para a plataforma
            </a>
          </nav>
        </div>

        <article className="space-y-4 text-sm leading-relaxed text-(--text-main)">
          {blocks.map((block, index) => {
            if (block.kind === "title") {
              return (
                <h1 key={index} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {block.text}
                </h1>
              );
            }
            if (block.kind === "heading") {
              return (
                <h2 key={index} className="pt-4 text-lg font-bold">
                  {block.text}
                </h2>
              );
            }
            if (block.kind === "subheading") {
              return (
                <h3 key={index} className="pt-2 text-base font-bold">
                  {block.text}
                </h3>
              );
            }
            if (block.kind === "list") {
              return (
                <ul key={index} className="list-disc space-y-1.5 pl-5">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              );
            }
            if (block.kind === "table") {
              const [head, ...rows] = block.rows;
              return (
                <div key={index} className="overflow-x-auto rounded-xl border border-(--border-subtle)">
                  <table className="w-full min-w-[560px] text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-(--border-subtle)">
                        {head.map((cell, cellIndex) => (
                          <th key={cellIndex} scope="col" className="px-3 py-2 font-bold">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-(--border-subtle) last:border-0">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 align-top">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return <p key={index}>{block.text}</p>;
          })}
        </article>
      </div>
    </div>
  );
}

/** Links dos dois documentos, para o rodapé das telas de acesso. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <a href="/termos" target="_blank" rel="noopener" className="font-bold underline underline-offset-2">
        Termos de Uso
      </a>{" "}
      e{" "}
      <a href="/privacidade" target="_blank" rel="noopener" className="font-bold underline underline-offset-2">
        Política de Privacidade
      </a>
    </p>
  );
}
