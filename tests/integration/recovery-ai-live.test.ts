import { describe, expect, it } from "vitest"

import { containsExternalContact } from "@/lib/answers/compose"
import { runPhotoReviewModel } from "@/lib/recovery/photo-review-model"
import { PHOTO_GUIDE } from "@/lib/recovery/review"
import { suggestActionByRules, type SuggestInput } from "@/lib/recovery/suggest"
import { runSuggestActionModel } from "@/lib/recovery/suggest-model"

// IA do Recuperador de verdade (custa centavos): sugerir ação (JSON estrito) e conferir fotos COM VISÃO (image_url). Só roda
// com RUN_LIVE_AI=1 e OPENAI_API_KEY definida (sem registrar uso nem consultar a pausa):
//   $env:OPENAI_API_KEY="..."; $env:RUN_LIVE_AI="1"; npx vitest run tests/integration/recovery-ai-live.test.ts
const enabled = process.env.RUN_LIVE_AI === "1" && Boolean(process.env.OPENAI_API_KEY)

// PNG 1x1 (a conferência tem que responder no schema mesmo com uma imagem sem conteúdo útil).
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

const input: SuggestInput = {
  mode: "appeal",
  buyerReason: "O produto chegou em boas condições, mas não quero mais",
  warehouse: { condition: "unsaleable", reasonId: "misused", destination: "buyer", benefited: "buyer", sellerStatus: "pending" },
  statusMoney: "refunded",
  amount: 289.9,
  currencyId: "BRL",
  deadlineAt: null,
  deadlineEstimated: true,
  affectsReputation: null,
  isCart: false,
  partialReturn: false,
  canOk: false,
  canFail: true,
}

describe.skipIf(!enabled)("Recuperador: IA de verdade", () => {
  it("sugere a ação no schema, sem contato externo", async () => {
    const baseline = suggestActionByRules(input)
    const suggestion = await runSuggestActionModel(input, baseline, { storeName: "Loja Teste", itemTitle: "Tênis de corrida" }, null)
    expect(["contest", "do_not_contest", "partial_refund"]).toContain(suggestion.action)
    expect(suggestion.reason.length).toBeGreaterThan(10)
    expect(suggestion.reason.length).toBeLessThanOrEqual(260)
    expect(containsExternalContact(suggestion.reason)).toBe(false)
  }, 60_000)

  it("confere uma foto com visão e responde no schema (uma imagem vazia não pode virar 'ok' sem cobrir o guia)", async () => {
    const guide = PHOTO_GUIDE.SRF2
    const review = await runPhotoReviewModel(
      {
        reasonId: "SRF2",
        reasonLabel: "O produto chegou avariado",
        checks: ["Produto quebrado, trincado ou amassado"],
        guide,
        appeal: false,
        itemTitle: "Tênis de corrida",
        photoCount: 1,
      },
      [PIXEL],
      null
    )
    expect(review).not.toBeNull()
    expect(review?.guide).toHaveLength(guide.length)
    expect(["ok", "needs_more", "unusable"]).toContain(review?.verdict)
  }, 90_000)
})