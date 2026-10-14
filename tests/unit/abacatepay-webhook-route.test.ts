import { beforeEach, describe, expect, it, vi } from "vitest"

import { signLegacy } from "@/lib/billing/abacatepay/webhook"

const mocks = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(async (): Promise<{ status: string; note: string }> => ({ status: "processed", note: "ok" })),
}))
vi.mock("@/lib/billing/engine", () => ({ processWebhookEvent: mocks.processWebhookEvent }))

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres-123"
const { POST } = await import("@/app/api/webhook/abacatepay/route")

const body = JSON.stringify({
  id: "log_1",
  event: "subscription.renewed",
  apiVersion: 2,
  devMode: false,
  data: { subscription: { id: "subs_1", amount: 9700, frequency: "MONTHLY", status: "ACTIVE" } },
})

function delivery(secret = SECRET, signature = signLegacy(body)) {
  return new Request(`https://maanu.com.br/api/webhook/abacatepay?webhookSecret=${secret}`, {
    method: "POST",
    body,
    headers: { "X-Webhook-Signature": signature, "Content-Type": "application/json" },
  })
}

describe("webhook da AbacatePay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET
  })

  it("sem segredo configurado: 503 (a AbacatePay tenta de novo depois)", async () => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET
    expect((await POST(delivery())).status).toBe(503)
    expect(mocks.processWebhookEvent).not.toHaveBeenCalled()
  })

  it("segredo ou assinatura errados: 401 e nada é processado", async () => {
    expect((await POST(delivery("errado"))).status).toBe(401)
    expect((await POST(delivery(SECRET, "assinatura-falsa"))).status).toBe(401)
    expect(mocks.processWebhookEvent).not.toHaveBeenCalled()
  })

  it("entrega válida: processa e responde 200", async () => {
    const response = await POST(delivery())
    expect(response.status).toBe(200)
    expect(mocks.processWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "log_1", type: "subscription.renewed" }))
  })

  it("erro ao processar: 500 (a AbacatePay tenta de novo)", async () => {
    mocks.processWebhookEvent.mockRejectedValueOnce(new Error("banco fora"))
    expect((await POST(delivery())).status).toBe(500)
  })
})