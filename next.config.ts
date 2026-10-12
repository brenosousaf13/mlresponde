import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Anexos do pós-venda (nota fiscal, fotos) vão pela Server Action: até 4 MB de arquivos (a Vercel aceita 4,5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.mlstatic.com" }],
  },
  async redirects() {
    // "Respostas da IA" virou "Assistente de IA" (2026-10-11).
    return [{ source: "/respostas", destination: "/assistente", permanent: false }]
  },
}

export default nextConfig
