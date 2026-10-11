import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.mlstatic.com" }],
  },
  async redirects() {
    // "Respostas da IA" virou "Assistente de IA" (2026-10-11).
    return [{ source: "/respostas", destination: "/assistente", permanent: false }]
  },
}

export default nextConfig
