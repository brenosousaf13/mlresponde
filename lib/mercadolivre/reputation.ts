import "server-only"

import { getValidAccessToken } from "@/lib/mercadolivre/accounts"
import { ML_API_URL, MlApiError } from "@/lib/mercadolivre/api"
import { orderSummaryFromMl, type MlClaimMessage, type OrderLike } from "@/lib/reputation/claim-details"
import type { MlClaim, MlClaimSearchPage } from "@/lib/reputation/claims"
import type { MlSellerReputation } from "@/lib/reputation/metrics"
import type { MlShipmentCosts, MlShipmentInfo, MlShipmentSla } from "@/lib/reputation/shipments"

// Chamadas ao Mercado Livre do Escudo de Reputação (etapa 1: só leitura; etapa 2: ações nas reclamações, sempre a
// pedido do vendedor).
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

/** Só situação, logística e rastreio do envio (endereço e telefone são descartados aqui). */
export async function fetchShipmentInfo(accountId: string, shipmentId: number, budget: CallBudget): Promise<MlShipmentInfo> {
  const shipment = await reputationRequest<MlShipmentInfo & Record<string, unknown>>(accountId, "/shipments/" + shipmentId, budget)
  return {
    status: shipment.status,
    substatus: shipment.substatus,
    logistic: shipment.logistic,
    logistic_type: shipment.logistic_type,
    tracking_number: typeof shipment.tracking_number === "string" ? shipment.tracking_number : null,
  }
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

// ---------------------------------------------------------------------------------------------- reclamações (etapa 2)
// Docs: developers.mercadolivre.com.br › Gerenciar reclamações / mensagem / resolução (conferidas em 2026-10-19).

const CLAIMS = "/post-purchase/v1/claims/"

/** Estado da reclamação (só Claims 2.0; as antigas respondem 401 com o token válido). */
export function fetchClaimDetail(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<Record<string, unknown>>(accountId, CLAIMS + claimId + "/detail", budget)
}

export function fetchClaimMessages(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<MlClaimMessage[]>(accountId, CLAIMS + claimId + "/messages", budget)
}

export function fetchClaimExpectedResolutions(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<unknown>(accountId, CLAIMS + claimId + "/expected-resolutions", budget)
}

/** Texto do motivo da reclamação (ex.: "Quero saber quando o produto chegará"). */
export async function fetchClaimReasonDetail(accountId: string, reasonId: string, budget: CallBudget): Promise<string | null> {
  const reason = await reputationRequest<{ detail?: unknown }>(accountId, CLAIMS + "reasons/" + encodeURIComponent(reasonId), budget)
  return typeof reason.detail === "string" ? reason.detail : null
}

/** Venda da reclamação: só itens, valor, data e o apelido do comprador (o resto da resposta é descartado aqui). */
export async function fetchClaimOrder(accountId: string, orderId: number, budget: CallBudget) {
  const order = await reputationRequest<OrderLike & { buyer?: { nickname?: unknown } | null; shipping?: { id?: unknown } | null }>(
    accountId,
    "/orders/" + orderId,
    budget
  )
  return {
    summary: orderSummaryFromMl(order),
    buyerNickname: typeof order.buyer?.nickname === "string" ? order.buyer.nickname.slice(0, 120) : null,
    shipmentId: Number(order.shipping?.id) > 0 ? Number(order.shipping?.id) : null,
  }
}

/** Resposta de uma ação no ML (para o histórico): status HTTP e corpo. */
export type MlActionResult = { status: number; body: unknown }

async function claimAction(accountId: string, path: string, body: unknown, budget: CallBudget): Promise<MlActionResult> {
  const data = await reputationRequest<unknown>(accountId, CLAIMS + path, budget, {
    method: "POST",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  return { status: 200, body: data }
}

/** Sobe um anexo (JPG, PNG ou PDF até 5 MB) e devolve o nome que o ML deu ao arquivo. */
export async function uploadClaimAttachment(accountId: string, claimId: number, file: Blob, filename: string, budget: CallBudget) {
  const form = new FormData()
  form.append("file", file, filename)
  const result = await claimAction(accountId, claimId + "/attachments", form, budget)
  const name = (result.body as { filename?: unknown } | null)?.filename
  if (typeof name !== "string" || !name) throw new Error("O Mercado Livre não devolveu o nome do anexo.")
  return name
}

export function sendClaimMessage(
  accountId: string,
  claimId: number,
  input: { receiverRole: "complainant" | "mediator"; message: string; attachments: string[] },
  budget: CallBudget
) {
  return claimAction(
    accountId,
    claimId + "/actions/send-message",
    { receiver_role: input.receiverRole, message: input.message, attachments: input.attachments },
    budget
  )
}

export function fetchPartialRefundOffers(accountId: string, claimId: number, budget: CallBudget) {
  return reputationRequest<Record<string, unknown>>(accountId, CLAIMS + claimId + "/partial-refund/available-offers", budget)
}

export function refundClaim(accountId: string, claimId: number, budget: CallBudget) {
  return claimAction(accountId, claimId + "/expected-resolutions/refund", undefined, budget)
}

export function partialRefundClaim(accountId: string, claimId: number, percentage: number, budget: CallBudget) {
  return claimAction(accountId, claimId + "/expected-resolutions/partial-refund", { percentage }, budget)
}

export function allowReturnClaim(accountId: string, claimId: number, budget: CallBudget) {
  return claimAction(accountId, claimId + "/expected-resolutions/allow-return", undefined, budget)
}

export function openClaimDispute(accountId: string, claimId: number, budget: CallBudget) {
  return claimAction(accountId, claimId + "/actions/open-dispute", undefined, budget)
}
