import "server-only"

import { headers } from "next/headers"

export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, "")

  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000"
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}

export async function authCallbackUrl(next: string): Promise<string> {
  return `${await getSiteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`
}
