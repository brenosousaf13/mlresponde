import { beforeEach, describe, expect, it, vi } from "vitest"

import { PHOTO_GUIDE } from "@/lib/recovery/review"

const captured = vi.hoisted(() => ({ calls: [] as { model: string; params: Record<string, unknown> }[], reply: "{}" }))

// Substitui só a chamada à OpenAI: o resto (montagem do pedido, schema, validação da resposta) roda de verdade.
vi.mock("@/lib/ai/usage", () => ({
  trackedCompletion: async (_context: unknown, model: string, call: (client: unknown) => Promise<unknown>) => {
    const client = {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>) => {
            captured.calls.push({ model, params })
            return { choices: [{ message: { content: captured.reply } }], usage: {} }
          },
        },
      },
    }
    return call(client)
  },
}))

import { runPhotoReviewModel } from "@/lib/recovery/photo-review-model"
import { suggestActionByRules, type SuggestInput } from "@/lib/recovery/suggest"
import { runSuggestActionModel } from "@/lib/recovery/suggest-model"

describe("chamadas à OpenAI do Recuperador", () => {
  beforeEach(() => {
    captured.calls.length = 0
    delete process.env.OPENAI_MODEL
  })

  it("conferência das fotos: image_url (data URL), JSON Schema estrito e modelo com visão", async () => {
    captured.reply = JSON.stringify({
      verdict: "ok",
      summary: "Fotos claras.",
      covered_guide: [1, 2, 3],
      extra_missing: [],
      supports_reason: "yes",
      photos: [{ index: 1, shows: "Caixa amassada com etiqueta", usable: true, issue: null }],
    })
    const review = await runPhotoReviewModel(
      { reasonId: "SRF2", reasonLabel: "O produto chegou avariado", checks: [], guide: PHOTO_GUIDE.SRF2, appeal: false, itemTitle: "Tênis", photoCount: 1 },
      ["data:image/jpeg;base64,AAAA"],
      { feature: "recovery_photo_review", organizationId: "org" }
    )
    expect(review?.verdict).toBe("ok")
    const [call] = captured.calls
    expect(call.model).toBe("gpt-6-luna")
    expect(call.params.reasoning_effort).toBe("low")
    expect(call.params.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "conferencia_fotos", strict: true } })
    const user = (call.params.messages as { role: string; content: unknown }[])[1]
    expect(JSON.stringify(user.content)).toContain('"type":"image_url"')
    expect(JSON.stringify(user.content)).toContain("data:image/jpeg;base64,AAAA")
  })

  it("modelo antigo sem visão (gpt-3.5) troca para o padrão do projeto; gpt-4o-mini segue", async () => {
    captured.reply = JSON.stringify({ verdict: "ok", summary: "", covered_guide: [], extra_missing: [], supports_reason: "yes", photos: [] })
    const run = () =>
      runPhotoReviewModel({ reasonId: "SRF7", reasonLabel: "x", checks: [], guide: [], appeal: false, itemTitle: null, photoCount: 1 }, ["data:image/png;base64,AA"], null)
    process.env.OPENAI_MODEL = "gpt-3.5-turbo"
    await run()
    process.env.OPENAI_MODEL = "gpt-4o-mini"
    await run()
    expect(captured.calls.map((call) => call.model)).toEqual(["gpt-6-luna", "gpt-4o-mini"])
    expect(captured.calls[1].params.temperature).toBe(0.2)
    expect(captured.calls[1].params.reasoning_effort).toBeUndefined()
  })

  it("resposta fora do schema na conferência vira null (a tela segue sem travar)", async () => {
    captured.reply = JSON.stringify({ verdict: "talvez" })
    expect(
      await runPhotoReviewModel({ reasonId: "SRF2", reasonLabel: "x", checks: [], guide: PHOTO_GUIDE.SRF2, appeal: false, itemTitle: null, photoCount: 1 }, ["data:image/png;base64,AA"], null)
    ).toBeNull()
  })

  it("sugerir ação: JSON Schema estrito e fallback para as regras quando a resposta é inválida", async () => {
    const input: SuggestInput = {
      mode: "appeal",
      buyerReason: "Não quero mais",
      warehouse: { condition: "unsaleable", reasonId: "misused", destination: "buyer", benefited: "buyer", sellerStatus: "pending" },
      statusMoney: "refunded",
      amount: 100,
      currencyId: "BRL",
      deadlineAt: null,
      deadlineEstimated: true,
      affectsReputation: null,
      isCart: false,
      partialReturn: false,
      canOk: false,
      canFail: true,
    }
    const baseline = suggestActionByRules(input)
    captured.reply = JSON.stringify({ action: "partial_refund", reason: "Peça só o que foi perdido.", confidence: "medium" })
    const suggestion = await runSuggestActionModel(input, baseline, { storeName: "Loja", itemTitle: null }, { feature: "recovery_suggest_action", organizationId: "org" })
    expect(suggestion).toMatchObject({ action: "partial_refund", source: "ai", confidence: "medium" })
    expect(captured.calls[0].params.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "sugestao_devolucao", strict: true } })
    captured.reply = JSON.stringify({ action: "vender", reason: "x", confidence: "high" })
    expect(await runSuggestActionModel(input, baseline, { storeName: "Loja", itemTitle: null }, null)).toBe(baseline)
  })
})