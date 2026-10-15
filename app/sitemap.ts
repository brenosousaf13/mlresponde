import type { MetadataRoute } from "next"

import { SALES_PAGE_INDEXABLE, SALES_PAGE_URL, SITE_CONTENT_UPDATED, SITE_URL } from "@/lib/site/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // A página de vendas só entra quando puder ser indexada (fora do Google enquanto está em revisão, lib/site/seo.ts).
    ...(SALES_PAGE_INDEXABLE
      ? [{ url: SALES_PAGE_URL, lastModified: SITE_CONTENT_UPDATED, changeFrequency: "weekly" as const, priority: 1 }]
      : []),
    { url: `${SITE_URL}/termos`, lastModified: "2026-10-14", changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacidade`, lastModified: "2026-10-14", changeFrequency: "yearly", priority: 0.2 },
  ]
}
