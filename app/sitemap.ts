import type { MetadataRoute } from "next"

import { SITE_CONTENT_UPDATED, SITE_URL } from "@/lib/site/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_CONTENT_UPDATED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/termos`, lastModified: "2026-10-14", changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacidade`, lastModified: "2026-10-14", changeFrequency: "yearly", priority: 0.2 },
  ]
}
