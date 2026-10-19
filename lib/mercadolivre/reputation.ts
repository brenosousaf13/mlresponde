import "server-only"

import { getValidAccessToken } from "@/lib/mercadolivre/accounts"
import { ML_API_URL, MlApiError } from "@/lib/mercadolivre/api"
import type { MlClaim, MlClaimSearchPage } from "@/lib/reputation/claims"
import type { MlSellerReputation } from "@/lib/reputation/metrics"
import type { MlShipmentCosts, MlShipmentInfo, MlShipmentSla } from "@/lib/reputation/shipments"

// Chamadas ao Mercado Livre do Escudo de Reputação (etapa 1: só leitura).
// Diferente do mlRequest (lib/mercadolivre/client.ts), um 401 aqui NUNCA marca o token como inválido: alguns recursos de
// reclamações respondem 401 para "Claims 1.0" com o token válido (conferido em 2026-10-19). Quem detecta token inválido
// continuam sendo as rotinas existentes (perguntas, pós-venda, clientes).

/** Limite de chamadas ao ML de uma rodada; um 429 encerra a rodada para todas as contas. */
export class CallBudget {
  rateLimited = false
  constructor(public remaining: number) {}

  get exhausted() {
    return this.rateLimited || this.remaining <= 0
  }

  take() {
    if (this.exhausted) throw new BudgetExhaustedError()
    this.remaining--
  }
}

export class BudgetExhaustedError extends Error {
  constructor() {
    super("Limite de chamadas ao Mercado Livre desta rodada.")
    this.name = "BudgetExhaustedError"
  }
}

const TIMEOUT_MS = 15_000

async function reputationRequest<T>(accountId: string, path: string, budget: CallBudget, init: RequestInit = {}): Promise<T> {
  budget.take()
  const accessToken = await getValidAccessToken(accountId)
  const headers = new Headers(init.headers)
  headers.set("authorization", "Bearer " + accessToken)
  headers.set("accept", "application/json")
  if (path.startsWith("/shipments/")) headers.set("x-format-new", "true")
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json")

  const response = await fetch(ML_API_URL + path, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 429) budget.rateLimited = true
  const data = (await response.json().catch(() => null)) as (Record<string, unknown> & T) | null
  if (!response.ok) {
    const message =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      "HTTP " + response.status
    const code = typeof data?.error === "string" ? data.error : undefined
    throw new MlApiError("Mercado Livre: " + message, response.status, code)
  }
  return data as T
}

/** Só o seller_reputation de /users/{id} (o resto da resposta tem dados pessoais e é descartado aqui). */
export async function fetchSellerReputation(accountId: string, mlUserId: number, budget: CallBudget) {
  const user = await reputationRequest<{ seller_reputation?: MlSellerReputation | null }>(accountId, "/users/" + mlUserId, budget)
  return user.seller_reputation ?? null
}

/** Reclamações em que o vendedor é o reclamado. Os filtros que funcionam são player_role/player_user_id. */
export function searchSellerClaims(
  accountId: string,
  mlUserId: number,
  params: Record<string, string>,
  budget: CallBudget
) {
  const query = new URLSearchParams({ player_role: "respondent", player_user_id: String(mlUserId), ...params })
  return reputationRequest<MlClaimSearchPage>(accountId, "/post-purchase/v1/claims/search?" + query.toString(), budget)
}

export function fetchClaim(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<MlClaim>(accountId, "/post-purchase/v1/claims/" + claimId, budget)
}

export function fetchClaimAffects(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<{ affects_reputation?: unknown; has_incentive?: unknown; due_date?: unknown }>(
    accountId,
    "/post-purchase/v1/claims/" + claimId + "/affects-reputation",
    budget
  )
}

/** Só a data da venda (para saber quando a reclamação sai da conta da reputação). */
export async function fetchOrderDate(accountId: string, orderId: number, budget: CallBudget): Promise<string | null> {
  const order = await reputationRequest<{ date_created?: unknown }>(accountId, "/orders/" + orderId, budget)
  return typeof order.date_created === "string" ? order.date_created : null
}

/** Só situação e logística do envio (endereço e telefone são descartados aqui). */
export async function fetchShipmentInfo(accountId: string, shipmentId: number, budget: CallBudget): Promise<MlShipmentInfo> {
  const shipment = await reputationRequest<MlShipmentInfo & Record<string, unknown>>(accountId, "/shipments/" + shipmentId, budget)
  return { status: shipment.status, substatus: shipment.substatus, logistic: shipment.logistic, logistic_type: shipment.logistic_type }
}

/** Prazo máximo de despacho. 404 = o ML não informa (cancelado, Full ou sem prazo): devolve null. */
export async function fetchShipmentSla(accountId: string, shipmentId: number, budget: CallBudget): Promise<MlShipmentSla | null> {
  try {
    return await reputationRequest<MlShipmentSla>(accountId, "/shipments/" + shipmentId + "/sla", budget)
  } catch (error) {
    if (error instanceof MlApiError && error.status === 404) return null
    throw error
  }
}

export function fetchShipmentCosts(accountId: string, shipmentId: number, budget: CallBudget) {
  return reputationRequest<MlShipmentCosts>(accountId, "/shipments/" + shipmentId + "/costs", budget)
}
