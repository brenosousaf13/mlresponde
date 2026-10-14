/**
 * Webhooks da AbacatePay: conferir a origem e ler o evento (puro, testado em tests/unit/abacatepay.test.ts).
 *
 * Existem dois formatos de entrega (tipos oficiais @abacatepay/types 4.0):
 *  - "legacy": o segredo vem na URL (?webhookSecret=) e o corpo é assinado (X-Webhook-Signature, HMAC-SHA256 com a
 *    chave pública da AbacatePay). Corpo com `id` (log_...) e `event`.
 *  - "Standard Webhooks" (endpoints criados depois da mudança da AbacatePay): cabeçalhos webhook-id,
 *    webhook-timestamp e webhook-signature (v1,<HMAC-SHA256 de "id.timestamp.corpo" com o segredo do webhook>).
 *    Corpo com `type` no lugar de `event` e sem `id` (o id da entrega é o cabeçalho webhook-id).
 * Aceitamos os dois. A leitura do corpo é tolerante (a AbacatePay pede para não validar o payload inteiro).
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import type { BillingCycle } from "@/lib/plans/plans"

import { cycleFromProvider } from "./catalog"

/** Chave pública da AbacatePay para as entregas no formato antigo (publicada na documentação; não é segredo). */
export const ABACATEPAY_SHARED_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"

/** Idade máxima (e diferença de relógio) de uma entrega Standard Webhooks, em segundos. */
export const STANDARD_TOLERANCE_SECONDS = 300

export const SUBSCRIPTION_EVENTS = [
  "subscription.completed",
  "subscription.trial_started",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.payment_failed",
  "subscription.plan_changed",
] as const

type HeaderReader = { get(name: string): string | null }

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export type DeliveryCheck =
  | { ok: true; format: "legacy" | "standard"; deliveryId: string | null }
  | { ok: false; reason: "bad_secret" | "bad_signature" | "missing_signature" | "stale" }

export function signLegacy(rawBody: string) {
  return createHmac("sha256", ABACATEPAY_SHARED_KEY).update(Buffer.from(rawBody, "utf8")).digest("base64")
}

export function signStandard(rawBody: string, id: string, timestamp: string, secret: string) {
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice("whsec_".length), "base64") : Buffer.from(secret, "utf8")
  return createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")
}

/** Confere se a entrega veio mesmo da AbacatePay (segredo do nosso webhook + assinatura do corpo). */
export function verifyDelivery(input: {
  rawBody: string
  url: string | URL
  headers: HeaderReader
  secret: string
  nowSeconds?: number
}): DeliveryCheck {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const standardSignature = input.headers.get("webhook-signature")
  if (standardSignature) {
    const id = input.headers.get("webhook-id") ?? ""
    const timestamp = input.headers.get("webhook-timestamp") ?? ""
    const seconds = Number(timestamp)
    if (!id || !Number.isInteger(seconds)) return { ok: false, reason: "bad_signature" }
    if (Math.abs(now - seconds) > STANDARD_TOLERANCE_SECONDS) return { ok: false, reason: "stale" }
    const expected = signStandard(input.rawBody, id, timestamp, input.secret)
    const valid = standardSignature.split(" ").some((entry) => {
      const [scheme, signature] = entry.split(",")
      return scheme === "v1" && Boolean(signature) && safeEqual(signature, expected)
    })
    return valid ? { ok: true, format: "standard", deliveryId: id } : { ok: false, reason: "bad_signature" }
  }

  const url = typeof input.url === "string" ? new URL(input.url) : input.url
  const given = url.searchParams.get("webhookSecret") ?? ""
  if (!given || !safeEqual(given, input.secret)) return { ok: false, reason: "bad_secret" }
  const signature = input.headers.get("x-webhook-signature")
  if (!signature) return { ok: false, reason: "missing_signature" }
  if (!safeEqual(signature, signLegacy(input.rawBody))) return { ok: false, reason: "bad_signature" }
  return { ok: true, format: "legacy", deliveryId: null }
}

// ---------------------------------------------------------------------------------------------- leitura do evento

export type WebhookSubscription = {
  id: string
  /** ACTIVE | CANCELLED | PENDING (como a AbacatePay manda). */
  status: string
  amountCents: number | null
  cycle: BillingCycle | null
  frequency: string | null
  method: "CARD" | "PIX" | null
  createdAt: string | null
  updatedAt: string | null
  canceledAt: string | null
  cancelledDueTo: string | null
  trialEndsAt: string | null
}

export type BillingWebhookEvent = {
  deliveryId: string
  type: string
  devMode: boolean
  subscription: WebhookSubscription | null
  checkout: { id: string | null; externalId: string | null; productIds: string[]; metadata: Record<string, unknown> } | null
  payment: { id: string | null; status: string | null; paidAt: string | null; receiptUrl: string | null; externalId: string | null } | null
  card: { brand: string | null; last4: string | null } | null
  customerId: string | null
  /** subscription.plan_changed: `requested` = enviado no pedido de troca (ainda pendente); senão, troca aplicada. */
  planChange: { requested: boolean; productId: string | null; newAmountCents: number | null } | null
  /** subscription.payment_failed: quantas tentativas falharam (quando a AbacatePay informa). */
  failure: { retryNumber: number | null; installmentNumber: number | null } | null
  /** Corpo recebido, para o histórico do painel. */
  payload: Record<string, unknown>
}

type Obj = Record<string, unknown>

function obj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null
}

function str(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null
}

function date(value: unknown): string | null {
  const text = str(value, 60)
  if (!text) return null
  const time = new Date(text).getTime()
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function method(value: unknown): "CARD" | "PIX" | null {
  return value === "CARD" || value === "PIX" ? value : null
}

/** Lê o corpo do webhook. Devolve null se não for JSON de evento. */
export function parseWebhookEvent(rawBody: string, deliveryIdHeader: string | null = null): BillingWebhookEvent | null {
  let body: Obj | null
  try {
    body = obj(JSON.parse(rawBody))
  } catch {
    return null
  }
  if (!body) return null
  const type = str(body.event, 80) ?? str(body.type, 80)
  if (!type) return null
  const data = obj(body.data) ?? {}

  const rawSubscription = obj(data.subscription)
  const subscriptionId = str(rawSubscription?.id, 100)
  const subscription: WebhookSubscription | null =
    rawSubscription && subscriptionId
      ? {
          id: subscriptionId,
          status: str(rawSubscription.status, 30) ?? "",
          amountCents: int(rawSubscription.amount),
          cycle: cycleFromProvider(str(rawSubscription.frequency, 30)),
          frequency: str(rawSubscription.frequency, 30),
          method: method(rawSubscription.method),
          createdAt: date(rawSubscription.createdAt),
          updatedAt: date(rawSubscription.updatedAt),
          canceledAt: date(rawSubscription.canceledAt),
          cancelledDueTo: str(rawSubscription.cancelledDueTo, 200),
          trialEndsAt: date(rawSubscription.trialEndsAt),
        }
      : null

  const rawCheckout = obj(data.checkout)
  const checkout = rawCheckout
    ? {
        id: str(rawCheckout.id, 100),
        externalId: str(rawCheckout.externalId, 200),
        productIds: (Array.isArray(rawCheckout.items) ? rawCheckout.items : [])
          .map((item) => str(obj(item)?.id, 100))
          .filter((id): id is string => Boolean(id)),
        metadata: obj(rawCheckout.metadata) ?? {},
      }
    : null

  const rawPayment = obj(data.payment)
  const payment = rawPayment
    ? {
        id: str(rawPayment.id, 100),
        status: str(rawPayment.status, 30),
        paidAt: date(rawPayment.updatedAt) ?? date(rawPayment.createdAt),
        receiptUrl: str(rawPayment.receiptUrl, 500),
        externalId: str(rawPayment.externalId, 200),
      }
    : null

  const payer = obj(data.payerInformation)
  const rawCard = obj(payer?.CARD)
  const last4 = str(rawCard?.number, 20)?.replace(/\D/g, "").slice(-4) ?? null
  const card = rawCard ? { brand: str(rawCard.brand, 40), last4: last4 && last4.length === 4 ? last4 : null } : null

  const planChange =
    type === "subscription.plan_changed"
      ? {
          requested: Boolean(str(data.changeSource, 60) || str(data.pendingUpdateId, 100)),
          productId: str(data.productId, 100),
          newAmountCents: int(data.newAmount),
        }
      : null

  const failure =
    type === "subscription.payment_failed"
      ? { retryNumber: int(data.retryNumber), installmentNumber: int(data.installmentNumber) }
      : null

  const deliveryId =
    str(body.id, 200) ?? str(deliveryIdHeader, 200) ?? `sha256:${createHash("sha256").update(rawBody).digest("hex")}`

  return {
    deliveryId,
    type,
    devMode: body.devMode === true,
    subscription,
    checkout,
    payment,
    card,
    customerId: str(obj(data.customer)?.id, 100),
    planChange,
    failure,
    payload: body,
  }
}