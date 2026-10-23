import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  usageCount: 0,
  modelCalls: 0,
  reply: "{}",
  failWith: null as Error | null,
}))

// Banco e OpenAI simulados: o que roda de verdade é o encadeamento do assist.ts (carregar, decidir o modo, cache, limite, plano B).
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const result = table === "ai_usage_events" ? { count: state.usageCount, error: null } : { data: state.tables[table] ?? null, error: null }
      const query: Record<string, unknown> = {}
      for (const method of ["select", "eq", "gte"]) query[method] = () => query
      query.maybeSingle = async () => result
      query.single = async () => result
      query.then = (resolve: (value: unknown) => unknown) => resolve(result)
      return query
    },
  }),
}))

vi.mock("@/lib/ai/usage", () => {
  class PlatformAiPausedError extends Error {}
  return {
    PlatformAiPausedError,
    trackedCompletion: async (_context: unknown, _model: string, call: (client: unknown) => Promise<unknown>) => {
      state.modelCalls += 1
      if (state.failWith) throw state.failWith
      return call({ chat: { completions: { create: async () => ({ choices: [{ message: { content: state.reply } }], usage: {} }) } } })
    },
  }
})

import { PlatformAiPausedError } from "@/lib/ai/usage"
import { reviewReturnPhotos, suggestReturnAction } from "@/lib/recovery/assist"

const ORG = "org-1"
const RETURN_ID = "11111111-1111-4111-8111-111111111111"

const row = (overrides: Record<string, unknown> = {}) => ({
  id: RETURN_ID,
  ml_account_id: "acc-1",
  claim_row_id: "claim-1",
  phase: "needs_review",
  item_title: "Tênis de corrida",
  orders: [{ order_id: 1, return_quantity: 1, total_quantity: 1 }],
  order_id: 1,
  can_review_ok: false,
  can_review_fail: true,
  destination: "warehouse",
  shipment_status: "delivered",
  return_status: "delivered",
  status_money: "refunded",
  amount: 289.9,
  currency_id: "BRL",
  deadline_at: null,
  is_cart: false,
  reviews: [
    {
      order_id: 1,
      method: "triage",
      stage: "seller_review_pending",
      status: "success",
      product_condition: "unsaleable",
      product_destination: "buyer",
      reason_id: "misused",
      benefited: "buyer",
      seller_status: "pending",
      seller_reason: null,
      updated_at: "2026-10-20T12:00:00.000Z",
    },
  ],
  ...overrides,
})

const photo = (name = "a.jpg", type = "image/jpeg") => new File([new Uint8Array([1, 2, 3, 4])], name, { type })

function load(returnRow: unknown) {
  state.tables = {
    recovery_returns: returnRow,
    organizations: { name: "Loja Teste" },
    reputation_claims: { reason_detail: "Não quero mais o produto", affects_reputation: "affected" },
  }
}

beforeEach(() => {
  state.usageCount = 0
  state.modelCalls = 0
  state.failWith = null
  state.reply = JSON.stringify({ action: "contest", reason: "Vale contestar com as fotos do envio.", confidence: "high" })
  load(row())
})

describe("suggestReturnAction", () => {
  it("devolução que não é da loja ou não espera revisão = sem sugestão", async () => {
    load(null)
    expect(await suggestReturnAction(ORG, RETURN_ID)).toEqual({ ok: false, message: "Devolução não encontrada." })
    load(row({ phase: "reviewed" }))
    expect(await suggestReturnAction(ORG, RETURN_ID)).toMatchObject({ ok: false })
    expect(state.modelCalls).toBe(0)
  })

  it("regras + IA, e a segunda abertura da página usa o cache (não paga a IA de novo)", async () => {
    load(row({ id: "22222222-2222-4222-8222-222222222222" }))
    const first = await suggestReturnAction(ORG, "22222222-2222-4222-8222-222222222222")
    expect(first).toMatchObject({ ok: true, suggestion: { action: "contest", source: "ai" } })
    const again = await suggestReturnAction(ORG, "22222222-2222-4222-8222-222222222222")
    expect(again).toEqual(first)
    expect(state.modelCalls).toBe(1)
  })

  it("IA com erro, pausada ou além do limite por hora = sugestão por regras (nunca falha a tela)", async () => {
    load(row({ id: "33333333-3333-4333-8333-333333333333" }))
    state.failWith = new Error("OpenAI fora do ar")
    const failed = await suggestReturnAction(ORG, "33333333-3333-4333-8333-333333333333")
    expect(failed).toMatchObject({ ok: true, suggestion: { source: "rules" } })

    state.failWith = new PlatformAiPausedError()
    load(row({ id: "44444444-4444-4444-8444-444444444444" }))
    expect(await suggestReturnAction(ORG, "44444444-4444-4444-8444-444444444444")).toMatchObject({ ok: true, suggestion: { source: "rules" } })

    state.failWith = null
    state.usageCount = 500
    state.modelCalls = 0
    load(row({ id: "55555555-5555-4555-8555-555555555555" }))
    expect(await suggestReturnAction(ORG, "55555555-5555-4555-8555-555555555555")).toMatchObject({ ok: true, suggestion: { source: "rules" } })
    expect(state.modelCalls).toBe(0)
  })
})

describe("reviewReturnPhotos", () => {
  const request = { reasonId: "SRF2", reasonLabel: "O produto chegou avariado", checks: ["broken"] }
  const answer = {
    verdict: "needs_more",
    summary: "Falta a etiqueta.",
    covered_guide: [2, 3],
    extra_missing: [],
    supports_reason: "yes",
    photos: [{ index: 1, shows: "Dano de perto", usable: true, issue: null }],
  }

  it("confere as fotos com a IA e fecha o veredito pelo guia do motivo", async () => {
    state.reply = JSON.stringify(answer)
    const result = await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.review.verdict).toBe("needs_more")
      expect(result.review.missing).toEqual(["Embalagem por fora, com a etiqueta"])
    }
    expect(state.modelCalls).toBe(1)
  })

  it("valida antes de gastar a IA: sem foto, formato inválido ou devolução de outra loja", async () => {
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [] })).toMatchObject({ ok: false, unavailable: false })
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo("a.heic", "image/heic")] })).toMatchObject({
      ok: false,
      unavailable: false,
      message: expect.stringContaining("JPG ou PNG"),
    })
    load(null)
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })).toEqual({
      ok: false,
      message: "Devolução não encontrada.",
      unavailable: false,
    })
    expect(state.modelCalls).toBe(0)
  })

  it("IA com erro, pausada, limite estourado ou resposta fora do schema = indisponível (a tela não trava o envio)", async () => {
    state.failWith = new Error("timeout")
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })).toMatchObject({ ok: false, unavailable: true })
    state.failWith = new PlatformAiPausedError()
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })).toMatchObject({ ok: false, unavailable: true })
    state.failWith = null
    state.reply = JSON.stringify({ verdict: "talvez" })
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })).toMatchObject({ ok: false, unavailable: true })
    state.usageCount = 999
    state.modelCalls = 0
    expect(await reviewReturnPhotos(ORG, RETURN_ID, { ...request, photos: [photo()] })).toMatchObject({ ok: false, unavailable: true })
    expect(state.modelCalls).toBe(0)
  })
})