import type { MetadataRoute } from "next"

import { PRIVATE_PATHS, SEARCH_AND_AI_CRAWLERS, SITE_URL } from "@/lib/site/seo"

/**
 * Buscadores e IAs: página de vendas, páginas legais e /llms.txt liberados; área logada fora.
 * Os robôs de busca e de IA aparecem pelo nome (além do "*"), com as mesmas regras: sinal claro de que podem ler o site.
 */
export default function robots(): MetadataRoute.Robots {
  const rule = { allow: "/", disallow: [...PRIVATE_PATHS] }
  return {
    rules: [
      { userAgent: "*", ...rule },
      { userAgent: [...SEARCH_AND_AI_CRAWLERS], ...rule },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
