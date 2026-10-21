import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Anexos do pós-venda (nota fiscal, fotos) vão pela Server Action: até 4 MB de arquivos (a Vercel aceita 4,5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.mlstatic.com" }],
  },
  async headers() {
    // Painel do administrador: fora de buscadores, sem iframe e sem vazar a URL para outros sites.
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  async rewrites() {
    // Vitrine de demonstração (app/demo-print): só em desenvolvimento, com ?demo-print=1. Mantém a URL do app (o menu
    // marca o item certo) e mostra a tela com dados fictícios. Em produção não existe.
    if (process.env.NODE_ENV === "production") return []
    return {
      beforeFiles: [
        { source: "/:tela", has: [{ type: "query", key: "demo-print" }], destination: "/demo-print/:tela" },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  async redirects() {
    return [
      // "Respostas da IA" virou "Assistente de IA" (2026-10-11).
      { source: "/respostas", destination: "/assistente", permanent: false },
      // A página de vendas saiu de /institucional (revisão) para a raiz do domínio principal (Sessão 27; SALES_PAGE_PATH
      // em lib/site/host.ts). A busca (?utm_source=...) vai junto. Roda antes do proxy.
      { source: "/institucional", destination: "/", permanent: true },
    ]
  },
}

export default nextConfig
