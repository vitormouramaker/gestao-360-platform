import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Ambientes fechados (homologacao) saem do build pedindo para nao serem
// indexados, direto no HTML -- sem depender de JavaScript.
function noindexEmHomologacao(ambiente: string | undefined) {
  return {
    name: "noindex-homologacao",
    transformIndexHtml(html: string) {
      if (ambiente !== "homologacao") return html;
      return html.replace(
        "</head>",
        '<meta name="robots" content="noindex, nofollow" /></head>',
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // O .env.production.local da VPS so chega aqui pelo loadEnv.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss(), noindexEmHomologacao(env.VITE_AMBIENTE)],
    // Porta própria, para não colidir com outros projetos Vite (5173).
    server: { port: 5180, strictPort: true },
    preview: { port: 4180, strictPort: true },
    build: {
      rollupOptions: {
        output: {
          // Separa as bibliotecas do código da plataforma: elas quase não mudam,
          // então o navegador reaproveita o que já baixou a cada atualização.
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-dados": ["@tanstack/react-query", "zustand", "axios"],
          },
        },
      },
    },
  };
})
