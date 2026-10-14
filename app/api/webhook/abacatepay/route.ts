import { NextResponse } from "next/server"

import { billingSettings } from "@/lib/billing/abacatepay/config"
import { parseWebhookEvent, verifyDelivery } from "@/lib/billing/abacatepay/webhook"
import { processWebhookEvent } from "@/lib/billing/engine"

export const maxDuration = 60

/**
 * Webhook da AbacatePay (assinaturas). Cadastrado pelo painel do administrador (Cobrança) com o segredo
 * ABACATEPAY_WEBHOOK_SECRET. Respostas:
 *  - 200: entregue (processada, ignorada ou repetida) — a AbacatePay não manda de novo;
 *  - 401: origem não confirmada (segredo/assinatura) — a AbacatePay não tenta de novo;
 *  - 500/503: erro nosso ou segredo ainda não configurado — a AbacatePay tenta de novo (até ~18 h).
 * A AbacatePay espera até 30 s; o processamento é feito antes de responder (ela recomenda responder 200 só no fim).
 */
export async function POST(request: Request) {
  const settings = billingSettings()
  if (!settings.webhookSecret || !settings.webhookSecretValid) {
    console.error("[webhook abacatepay] ABACATEPAY_WEBHOOK_SECRET ausente ou curto: entrega adiada")
    return NextResponse.json({ error: "not_configured" }, { status: 503 })
  }

  const rawBody = await request.text()
  const check = verifyDelivery({ rawBody, url: request.url, headers: request.headers, secret: settings.webhookSecret })
  if (!check.ok) {
    console.warn(`[webhook abacatepay] entrega recusada: ${check.reason}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const event = parseWebhookEvent(rawBody, check.deliveryId)
  if (!event) return NextResponse.json({ ok: true, ignored: "corpo inválido" })

  try {
    const outcome = await processWebhookEvent(event)
    console.info(`[webhook abacatepay] ${event.type} ${event.deliveryId} (${check.format}): ${outcome.status} — ${outcome.note}`)
    return NextResponse.json({ ok: true, status: outcome.status })
  } catch (error) {
    console.error(`[webhook abacatepay] ${event.type} ${event.deliveryId}:`, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "processing_failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" })
}