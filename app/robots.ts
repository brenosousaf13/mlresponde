import type { MetadataRoute } from "next"

import { siteConfig } from "@/lib/config/site"

/** Buscadores: a página de vendas e as páginas legais; a área logada fica de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/painel",
        "/perguntas",
        "/assistente",
        "/resultados",
        "/pos-venda",
        "/melhorias",
        "/contas",
        "/assinatura",
        "/configuracoes",
        "/onboarding",
        "/admin",
        "/acesso-negado",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: `${siteConfig.marketingUrl}/sitemap.xml`,
  }
}
