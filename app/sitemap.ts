import type { MetadataRoute } from "next"

import { siteConfig } from "@/lib/config/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.marketingUrl
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/termos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacidade`, changeFrequency: "yearly", priority: 0.2 },
  ]
}
