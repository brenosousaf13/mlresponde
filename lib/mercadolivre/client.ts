import "server-only"

import { MlAccountUnavailableError, forgetAccessToken, getValidAccessToken, markTokenInvalid } from "@/lib/mercadolivre/accounts"
import { ML_API_URL, MlApiError } from "@/lib/mercadolivre/api"

/**
 * Chamada autenticada ao ML. O token pode vir guardado na instância (lib/mercadolivre/accounts.ts): num 401, tenta 1 vez
 * com o token lido do banco (pode ter sido renovado ou reconectado em outra instância) antes de marcar a conta como inválida.
 */
async function authorizedFetch(accountId: string, path: string, init: RequestInit, json: boolean): Promise<Response> {
  for (const fresh of [false, true]) {
    const accessToken = await getValidAccessToken(accountId, { fresh })
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${accessToken}`)
    if (json) {
      headers.set("accept", "application/json")
      if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json")
    }
    const response = await fetch(`${ML_API_URL}${path}`, { ...init, headers, cache: "no-store" })
    if (response.status !== 401) return response
    forgetAccessToken(accountId)
  }
  await markTokenInvalid(accountId, "O Mercado Livre recusou o token (HTTP 401).")
  throw new MlAccountUnavailableError("A autorização do Mercado Livre expirou. Reconecte a conta.")
}

export async function mlRequest<T>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(accountId, path, init, true)
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

/** Resposta bruta do ML (para arquivos, como anexos de mensagens). 401 (2 vezes) marca o token como inválido. */
export async function mlFetchRaw(accountId: string, path: string, init: RequestInit = {}): Promise<Response> {
  return authorizedFetch(accountId, path, init, false)
}
