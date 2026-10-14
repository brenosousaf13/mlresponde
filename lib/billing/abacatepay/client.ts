import "server-only"

import { billingSettings } from "./config"
import type { AbacateProduct } from "./catalog"

/**
 * Cliente mínimo da API v2 da AbacatePay (https://docs.abacatepay.com). Sem SDK: as poucas rotas que usamos, com tipos
 * próprios (conferidos com @abacatepay/types 4.0). A chave fica só no servidor e nunca aparece nas mensagens de erro.
 * Leituras (GET) tentam de novo uma vez em erro passageiro; criações não (o checkout é idempotente pelo externalId,
 * mas cancelar/trocar de plano não devem ser repetidos às cegas).
 */

const BASE_URL = "https://api.abacatepay.com/v2"
const TIMEOUT_MS = 15_000

export class AbacatePayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: "config" | "network" | "http"
  ) {
    super(message)
    this.name = "AbacatePayError"
  }
}

type Query = Record<string, string | number | undefined>

const STATUS_MESSAGES: Record<number, string> = {
  401: "A AbacatePay recusou a chave de API (ausente, errada ou revogada).",
  403: "A chave de API da AbacatePay não tem a permissão para esta operação.",
  429: "A AbacatePay pediu para esperar (muitas requisições).",
}

async function request<T>(method: "GET" | "POST", path: string, options: { query?: Query; body?: unknown } = {}, attempt = 0): Promise<T> {
  const apiKey = billingSettings().apiKey
  if (!apiKey) throw new AbacatePayError("A chave de API da AbacatePay não está configurada.", null, "config")

  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    if (method === "GET" && attempt === 0) return request<T>(method, path, options, 1)
    const timeout = error instanceof Error && error.name === "TimeoutError"
    throw new AbacatePayError(
      timeout ? "A AbacatePay demorou demais para responder." : "Não foi possível falar com a AbacatePay.",
      null,
      "network"
    )
  }

  const payload = (await response.json().catch(() => null)) as { data?: unknown; success?: boolean; error?: unknown } | null
  if (!response.ok || !payload || payload.success === false) {
    if (method === "GET" && attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      return request<T>(method, path, options, 1)
    }
    const apiMessage = typeof payload?.error === "string" ? payload.error.slice(0, 300) : null
    throw new AbacatePayError(
      STATUS_MESSAGES[response.status] ?? apiMessage ?? `A AbacatePay respondeu com erro (HTTP ${response.status}).`,
      response.status,
      "http"
    )
  }
  return payload.data as T
}

type Obj = Record<string, unknown>
const asObj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {})
const asStr = (value: unknown): string | null => (typeof value === "string" && value ? value : null)
const asNum = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)

// ---------------------------------------------------------------------------------------------- loja e produtos

export async function getStore(): Promise<{ id: string | null; name: string | null }> {
  const data = asObj(await request<unknown>("GET", "/stores/get"))
  return { id: asStr(data.id), name: asStr(data.name) }
}

/** Todos os produtos da loja (até 5 páginas de 100). */
export async function listProducts(): Promise<AbacateProduct[]> {
  const products: AbacateProduct[] = []
  let after: string | undefined
  for (let page = 0; page < 5; page++) {
    const apiKey = billingSettings().apiKey
    if (!apiKey) throw new AbacatePayError("A chave de API da AbacatePay não está configurada.", null, "config")
    const url = new URL(`${BASE_URL}/products/list`)
    url.searchParams.set("limit", "100")
    if (after) url.searchParams.set("after", after)
    // A paginação vem ao lado de `data`, então esta leitura não usa request().
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch {
      throw new AbacatePayError("Não foi possível falar com a AbacatePay.", null, "network")
    }
    const payload = asObj(await response.json().catch(() => null))
    if (!response.ok || payload.success === false) {
      throw new AbacatePayError(
        STATUS_MESSAGES[response.status] ?? asStr(payload.error) ?? `A AbacatePay respondeu com erro (HTTP ${response.status}).`,
        response.status,
        "http"
      )
    }
    for (const item of Array.isArray(payload.data) ? payload.data : []) {
      const product = asObj(item)
      const id = asStr(product.id)
      if (!id) continue
      products.push({
        id,
        externalId: asStr(product.externalId),
        name: asStr(product.name) ?? "",
        price: asNum(product.price) ?? 0,
        status: asStr(product.status) ?? "",
        cycle: asStr(product.cycle),
        devMode: product.devMode === true,
        trialDays: asNum(product.trialDays),
        updatedAt: asStr(product.updatedAt),
      })
    }
    const next = asStr(asObj(payload.pagination).next)
    if (!next || next === after) break
    after = next
  }
  return products
}

// ---------------------------------------------------------------------------------------------- clientes e checkout

export async function createCustomer(input: {
  email: string
  name?: string
  taxId?: string
  cellphone?: string
  zipCode?: string
}): Promise<{ id: string }> {
  const data = asObj(await request<unknown>("POST", "/customers/create", { body: input }))
  const id = asStr(data.id)
  if (!id) throw new AbacatePayError("A AbacatePay não devolveu o cliente.", null, "http")
  return { id }
}

export type SubscriptionCheckout = {
  id: string
  url: string
  amountCents: number | null
  status: string | null
  devMode: boolean
  externalId: string | null
}

export async function createSubscriptionCheckout(input: {
  productId: string
  customerId?: string
  externalId: string
  returnUrl: string
  completionUrl: string
  methods: ("CARD" | "PIX")[]
  metadata: Record<string, string>
  retryPolicy: { maxRetry: number; retryEvery: number }
}): Promise<SubscriptionCheckout> {
  const data = asObj(
    await request<unknown>("POST", "/subscriptions/create", {
      body: {
        items: [{ id: input.productId, quantity: 1 }],
        customerId: input.customerId,
        externalId: input.externalId,
        returnUrl: input.returnUrl,
        completionUrl: input.completionUrl,
        methods: input.methods,
        metadata: input.metadata,
        retryPolicy: input.retryPolicy,
      },
    })
  )
  const id = asStr(data.id)
  const url = asStr(data.url)
  if (!id || !url || !url.startsWith("https://")) throw new AbacatePayError("A AbacatePay não devolveu a página de pagamento.", null, "http")
  return {
    id,
    url,
    amountCents: asNum(data.amount),
    status: asStr(data.status),
    devMode: data.devMode === true,
    externalId: asStr(data.externalId),
  }
}

// ---------------------------------------------------------------------------------------------- assinaturas

export type ProviderSubscription = {
  id: string
  status: string
  amountCents: number | null
  checkoutId: string | null
  customerId: string | null
  method: string | null
  devMode: boolean
  updatedAt: string | null
}

function toSubscription(value: unknown): ProviderSubscription {
  const data = asObj(value)
  const id = asStr(data.id)
  if (!id) throw new AbacatePayError("A AbacatePay não devolveu a assinatura.", null, "http")
  return {
    id,
    status: asStr(data.status) ?? "",
    amountCents: asNum(data.amount),
    checkoutId: asStr(data.checkoutId),
    customerId: asStr(data.customerId),
    method: asStr(data.method),
    devMode: data.devMode === true,
    updatedAt: asStr(data.updatedAt),
  }
}

export async function getSubscription(id: string): Promise<ProviderSubscription> {
  return toSubscription(await request<unknown>("GET", "/subscriptions/get", { query: { id } }))
}

/** Cancela na hora (a AbacatePay não tem "cancelar no fim do período"; o app mantém o acesso até lá). */
export async function cancelSubscription(id: string): Promise<ProviderSubscription> {
  return toSubscription(await request<unknown>("POST", "/subscriptions/cancel", { body: { id } }))
}

/** Troca o produto (mesmo ciclo). O novo valor passa a ser cobrado na próxima renovação. */
export async function changeSubscriptionPlan(id: string, productId: string): Promise<{ status: string | null; newAmountCents: number | null }> {
  const data = asObj(await request<unknown>("POST", "/subscriptions/change-plan", { body: { id, productId, quantity: 1 } }))
  return { status: asStr(data.status), newAmountCents: asNum(data.newAmount) }
}

// ---------------------------------------------------------------------------------------------- webhooks

export type ProviderWebhook = { id: string; name: string; endpoint: string; events: string[]; devMode: boolean }

function toWebhook(value: unknown): ProviderWebhook {
  const data = asObj(value)
  return {
    id: asStr(data.id) ?? "",
    name: asStr(data.name) ?? "",
    endpoint: asStr(data.endpoint) ?? "",
    events: Array.isArray(data.events) ? data.events.filter((event): event is string => typeof event === "string") : [],
    devMode: data.devMode === true,
  }
}

export async function listWebhooks(): Promise<ProviderWebhook[]> {
  const data = await request<unknown>("GET", "/webhooks/list", { query: { limit: 100 } })
  return (Array.isArray(data) ? data : []).map(toWebhook)
}

export async function createWebhook(input: { name: string; endpoint: string; secret: string; events: string[] }): Promise<ProviderWebhook> {
  return toWebhook(await request<unknown>("POST", "/webhooks/create", { body: input }))
}