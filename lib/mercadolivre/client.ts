import "server-only"

import { MlAccountUnavailableError, getValidAccessToken, markTokenInvalid } from "@/lib/mercadolivre/accounts"
import { ML_API_URL, MlApiError } from "@/lib/mercadolivre/api"

export async function mlRequest<T>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getValidAccessToken(accountId)
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${accessToken}`)
  headers.set("accept", "application/json")
  if (init.body) headers.set("content-type", "application/json")

  const response = await fetch(`${ML_API_URL}${path}`, { ...init, headers, cache: "no-store" })

  if (response.status === 401) {
    await markTokenInvalid(accountId, "O Mercado Livre recusou o token (HTTP 401).")
    throw new MlAccountUnavailableError("A autorização do Mercado Livre expirou. Reconecte a conta.")
  }

  const data = (await response.json().catch(() => null)) as (Record<string, unknown> & T) | null
  if (!response.ok) {
    const message =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      `HTTP ${response.status}`
    const code = typeof data?.error === "string" ? data.error : undefined
    throw new MlApiError(`Mercado Livre: ${message}`, response.status, code)
  }
  return data as T
}
