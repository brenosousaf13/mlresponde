import { describe, expect, it } from "vitest"

import { followUpSummary, returnFollowUp, STALE_AFTER_DAYS, type FollowUpInput } from "@/lib/recovery/follow-up"
import {
  PHOTO_REVIEW_SCHEMA,
  buildPhotoReviewMessages,
  buildPhotoReviewSystemPrompt,
  normalizePhotoReview,
  photoFingerprint,
  photoReviewGate,
  visionModelFor,
} from "@/lib/recovery/photo-review"
import { buyerReasonKind, type ReturnReview } from "@/lib/recovery/returns"
import { PHOTO_GUIDE } from "@/lib/recovery/review"
import {
  SUGGESTION_SCHEMA,
  buildSuggestionMessages,
  normalizeSuggestion,
  sanitizeSuggestion,
  suggestActionByRules,
  suggestInputFromRows,
  suggestionLabel,
  type SuggestInput,
} from "@/lib/recovery/suggest"

const NOW = new Date("2026-10-23T15:00:00.000Z")

function review(overrides: Partial<ReturnReview>): ReturnReview {
  return {
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
    ...overrides,
  }
}

function input(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    mode: "appeal",
    buyerReason: "Não quero mais o produto",
    warehouse: { condition: "unsaleable", reasonId: "misused", destination: "buyer", benefited: "buyer", sellerStatus: "pending" },
    statusMoney: "refunded",
    amount: 289.9,
    currencyId: "BRL",
    deadlineAt: "2026-12-20T12:00:00.000Z",
    deadlineEstimated: true,
    affectsReputation: null,
    isCart: false,
    partialReturn: false,
    canOk: false,
    canFail: true,
    ...overrides,
  }
}

/** Todo objeto do JSON Schema estrito da OpenAI: additionalProperties false e todas as propriedades em required. */
function expectStrict(schema: unknown) {
  const node = schema as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; items?: unknown }
  if (node?.type === "object") {
    expect(node.additionalProperties).toBe(false)
    expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort())
    for (const child of Object.values(node.properties ?? {})) expectStrict(child)
  }
  if (node?.type === "array") expectStrict(node.items)
}

describe("motivo do comprador", () => {
  it("separa arrependimento, defeito e texto que não diz", () => {
    expect(buyerReasonKind("Produto chegou em boas condições mas não quero mais")).toBe("regret")
    expect(buyerReasonKind("O produto veio com defeito e não funciona")).toBe("problem")
    expect(buyerReasonKind("Outro motivo")).toBe("unknown")
    expect(buyerReasonKind(null)).toBe("unknown")
    // Mesma precedência de appealStrength: arrependimento vence quando há os dois sinais.
    expect(buyerReasonKind("Tamanho menor do que o esperado, com defeito")).toBe("regret")
  })
})

describe("sugerir ação: regras", () => {
  it("contestação forte: comprador se arrependeu e o armazém achou uso", () => {
    const suggestion = suggestActionByRules(input(), NOW)
    expect(suggestion.action).toBe("contest")
    expect(suggestion.confidence).toBe("high")
    expect(suggestion.source).toBe("rules")
    expect(suggestion.needsInspection).toBe(false)
    expect(suggestion.signals.join(" ")).toContain("Armazém do ML")
    expect(suggestion.signals.join(" ")).toContain("R$")
    expect(suggestionLabel(suggestion.action, "appeal")).toBe("Contestar a revisão do armazém")
  })

  it("contestação fraca: defeito de funcionamento ou comprador já reclamou de defeito = não contestar", () => {
    const notWorking = suggestActionByRules(
      input({ warehouse: { condition: "unsaleable", reasonId: "not_working", destination: "buyer", benefited: "buyer", sellerStatus: "pending" } }),
      NOW
    )
    expect(notWorking.action).toBe("do_not_contest")
    expect(notWorking.confidence).toBe("medium")
    const defect = suggestActionByRules(input({ buyerReason: "O produto veio com defeito" }), NOW)
    expect(defect.action).toBe("do_not_contest")
    expect(suggestionLabel("do_not_contest", "appeal")).toBe("Não contestar")
  })

  it("só a embalagem (ou unidades que faltaram) = ressarcimento parcial; o resto = contestar com confiança média", () => {
    const packaging = suggestActionByRules(
      input({
        buyerReason: "Outro motivo",
        warehouse: { condition: "unsaleable", reasonId: "other_attribute", destination: "buyer", benefited: "buyer", sellerStatus: "pending" },
      }),
      NOW
    )
    expect(packaging.action).toBe("partial_refund")
    const partial = suggestActionByRules(input({ buyerReason: "Outro motivo", partialReturn: true }), NOW)
    expect(partial.action).toBe("partial_refund")
    const plain = suggestActionByRules(input({ buyerReason: "Outro motivo" }), NOW)
    expect(plain).toMatchObject({ action: "contest", confidence: "medium" })
  })

  it("pacote chegou: o dono precisa conferir; arrependimento e defeito sugerem não relatar sem dano", () => {
    const regret = suggestActionByRules(input({ mode: "arrival", warehouse: null, canOk: true }), NOW)
    expect(regret).toMatchObject({ action: "do_not_contest", confidence: "low", needsInspection: true })
    expect(suggestionLabel(regret.action, "arrival")).toBe("Confirmar que chegou certinho")
    const defect = suggestActionByRules(input({ mode: "arrival", warehouse: null, canOk: true, buyerReason: "Defeito: não funciona" }), NOW)
    expect(defect.action).toBe("do_not_contest")
    expect(defect.needsInspection).toBe(true)
    const unknown = suggestActionByRules(input({ mode: "arrival", warehouse: null, canOk: true, buyerReason: null }), NOW)
    expect(unknown.reason).toContain("Não temos o motivo")
    const missing = suggestActionByRules(input({ mode: "arrival", warehouse: null, canOk: true, partialReturn: true }), NOW)
    expect(missing).toMatchObject({ action: "partial_refund", needsInspection: true })
    expect(suggestionLabel("contest", "arrival")).toBe("Relatar o problema ao ML")
  })

  it("só sugere o que o ML aceita agora", () => {
    const blocked = suggestActionByRules(input({ canFail: false }), NOW)
    expect(blocked.action).toBe("do_not_contest")
    expect(blocked.confidence).toBe("low")
    const onlyReport = sanitizeSuggestion(
      suggestActionByRules(input({ mode: "arrival", warehouse: null, canOk: false, canFail: true }), NOW),
      input({ mode: "arrival", warehouse: null, canOk: false, canFail: true })
    )
    expect(onlyReport.reason).toContain("só aceita o relato de problema")
  })

  it("fatos: dinheiro, reputação, prazo e carrinho viram sinais curtos", () => {
    const signals = suggestActionByRules(
      input({ statusMoney: "retained", affectsReputation: "affected", isCart: true, deadlineAt: "2026-10-23T20:00:00.000Z", deadlineEstimated: false }),
      NOW
    ).signals.join(" | ")
    expect(signals).toContain("retido no Mercado Pago")
    expect(signals).toContain("afeta a sua reputação")
    expect(signals).toContain("carrinho")
    expect(signals).toContain("Faltam 5 h para o prazo.")
    expect(suggestActionByRules(input({ deadlineAt: "2026-10-01T00:00:00.000Z" }), NOW).signals.join(" ")).toContain("estimado já passou")
  })
})

describe("sugerir ação: dados do banco", () => {
  const row = {
    reviews: [review({ order_id: 1 }), review({ order_id: 2, reason_id: "damaged" })],
    orders: [{ order_id: 1, return_quantity: 1, total_quantity: 3 }],
    order_id: 1,
    status_money: "refunded",
    amount: "120.5",
    currency_id: "BRL",
    deadline_at: "2026-12-20T12:00:00.000Z",
    is_cart: false,
    can_review_ok: false,
    can_review_fail: true,
  }

  it("usa só a revisão do pedido da reclamação, devolução parcial e reputação", () => {
    const built = suggestInputFromRows(row, { reason_detail: " Arrependimento ", affects_reputation: "affected" }, "appeal")
    expect(built.warehouse?.reasonId).toBe("misused")
    expect(built.partialReturn).toBe(true)
    expect(built.amount).toBe(120.5)
    expect(built.buyerReason).toBe("Arrependimento")
    expect(built.affectsReputation).toBe("affected")
    expect(built.deadlineEstimated).toBe(true)
    expect(suggestInputFromRows({ ...row, orders: [{ order_id: 1, return_quantity: 3, total_quantity: 3 }] }, null, "arrival").partialReturn).toBe(false)
    expect(suggestInputFromRows({ ...row, reviews: "x", orders: null }, null, "arrival")).toMatchObject({ warehouse: null, partialReturn: false })
  })
})

describe("sugerir ação: IA (prompt, schema e validação)", () => {
  const baseInput = input()
  const baseline = suggestActionByRules(baseInput, NOW)

  it("schema estrito e prompt sem inventar nem contato externo", () => {
    expectStrict(SUGGESTION_SCHEMA)
    const [system, user] = buildSuggestionMessages("Loja", baseInput, baseline, "Tênis")
    expect(system.content).toContain("Nunca invente")
    expect(system.content).toContain("Proibido contato")
    expect(user.content).toContain("Motivo declarado pelo comprador: Não quero mais o produto")
    expect(user.content).toContain("Sugestão base das regras: contest")
    expect(user.content).toContain("Frete da devolução: (não disponível)")
  })

  it("aceita a resposta da IA, mas diverge das regras só com confiança limitada", () => {
    const same = normalizeSuggestion({ action: "contest", reason: "Vale contestar com as fotos do envio.", confidence: "high" }, baseInput, baseline, NOW)
    expect(same).toMatchObject({ action: "contest", confidence: "high", source: "ai" })
    expect(same.signals).toEqual(baseline.signals)
    const different = normalizeSuggestion({ action: "do_not_contest", reason: "O argumento é fraco.", confidence: "high" }, baseInput, baseline, NOW)
    expect(different).toMatchObject({ action: "do_not_contest", confidence: "medium", source: "ai" })
  })

  it("resposta inválida, vazia ou com contato externo volta para as regras", () => {
    expect(normalizeSuggestion(null, baseInput, baseline, NOW)).toBe(baseline)
    expect(normalizeSuggestion({ action: "enviar", reason: "x", confidence: "high" }, baseInput, baseline, NOW)).toBe(baseline)
    expect(normalizeSuggestion({ action: "contest", reason: "  ", confidence: "high" }, baseInput, baseline, NOW)).toBe(baseline)
    expect(normalizeSuggestion({ action: "contest", reason: "Fale comigo em loja@exemplo.com", confidence: "high" }, baseInput, baseline, NOW)).toBe(baseline)
    expect(normalizeSuggestion({ action: "contest", reason: "ok", confidence: "certa" }, baseInput, baseline, NOW)).toBe(baseline)
  })

  it("texto longo é cortado e a ação precisa ser possível agora", () => {
    const long = normalizeSuggestion({ action: "contest", reason: "a".repeat(400), confidence: "low" }, baseInput, baseline, NOW)
    expect(long.reason.length).toBeLessThanOrEqual(260)
    const blockedInput = input({ canFail: false })
    const blocked = normalizeSuggestion({ action: "contest", reason: "Vale contestar.", confidence: "high" }, blockedInput, baseline, NOW)
    expect(blocked.action).toBe("do_not_contest")
  })
})

describe("ver as fotos: IA com visão", () => {
  const guide = PHOTO_GUIDE.SRF2
  const photo = (index: number, extra: Record<string, unknown> = {}) => ({ index, shows: "Caixa amassada", usable: true, issue: null, ...extra })
  const raw = (overrides: Record<string, unknown> = {}) => ({
    verdict: "ok",
    summary: "Fotos claras.",
    covered_guide: [1, 2, 3],
    extra_missing: [],
    supports_reason: "yes",
    photos: [photo(1), photo(2), photo(3)],
    ...overrides,
  })

  it("usa o mesmo modelo do projeto (Luna aceita imagem); só o gpt-3.5 troca para o padrão", () => {
    expect(visionModelFor("gpt-6-luna")).toBe("gpt-6-luna")
    expect(visionModelFor("gpt-4o-mini")).toBe("gpt-4o-mini")
    expect(visionModelFor("gpt-3.5-turbo")).toBe("gpt-6-luna")
  })

  it("schema estrito e mensagens com as imagens (data URL) na ordem", () => {
    expectStrict(PHOTO_REVIEW_SCHEMA)
    expect(buildPhotoReviewSystemPrompt()).toContain("Nunca invente")
    const messages = buildPhotoReviewMessages(
      { reasonId: "SRF2", reasonLabel: "O produto chegou avariado", checks: ["Produto quebrado"], guide, appeal: false, itemTitle: "Tênis", photoCount: 2 },
      ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]
    )
    expect(messages).toHaveLength(2)
    const parts = messages[1].content as { type: string; text?: string; image_url?: { url: string; detail: string } }[]
    expect(parts.map((part) => part.type)).toEqual(["text", "text", "image_url", "text", "image_url"])
    expect(parts[0].text).toContain("1. Embalagem por fora, com a etiqueta")
    expect(parts[0].text).toContain("Produto quebrado")
    expect(parts[1].text).toBe("Foto 1:")
    expect(parts[2].image_url?.url).toBe("data:image/jpeg;base64,AAA")
    expect(parts[4].image_url?.url).toBe("data:image/jpeg;base64,BBB")
  })

  it("todas as fotos do guia cobertas e o motivo sustentado = ok", () => {
    const result = normalizePhotoReview(raw(), { guide, photoCount: 3 })
    expect(result?.verdict).toBe("ok")
    expect(result?.guide.every((entry) => entry.covered)).toBe(true)
    expect(result?.missing).toEqual([])
    expect(result?.photos).toHaveLength(3)
  })

  it("faltou ângulo do guia, mesmo que o modelo diga ok = precisa de mais fotos", () => {
    const result = normalizePhotoReview(raw({ covered_guide: [1], extra_missing: ["foto mais nítida do dano"] }), { guide, photoCount: 3 })
    expect(result?.verdict).toBe("needs_more")
    expect(result?.missing).toEqual([guide[1], guide[2], "foto mais nítida do dano"])
    expect(result?.guide.map((entry) => entry.covered)).toEqual([true, false, false])
    expect(normalizePhotoReview(raw({ supports_reason: "no" }), { guide, photoCount: 3 })?.verdict).toBe("needs_more")
  })

  it("nenhuma foto utilizável = não serve; o modelo só piora o veredito, nunca melhora", () => {
    const unusable = normalizePhotoReview(
      raw({ photos: [photo(1, { usable: false, issue: "Muito escura" }), photo(2, { usable: false })] }),
      { guide, photoCount: 2 }
    )
    expect(unusable?.verdict).toBe("unusable")
    expect(unusable?.photos[0].issue).toBe("Muito escura")
    expect(normalizePhotoReview(raw({ verdict: "unusable" }), { guide, photoCount: 3 })?.verdict).toBe("unusable")
    expect(normalizePhotoReview(raw({ verdict: "needs_more" }), { guide, photoCount: 3 })?.verdict).toBe("needs_more")
  })

  it("resposta malformada vira null; índices inválidos e repetidos são descartados", () => {
    expect(normalizePhotoReview(null, { guide, photoCount: 1 })).toBeNull()
    expect(normalizePhotoReview({ verdict: "talvez" }, { guide, photoCount: 1 })).toBeNull()
    expect(normalizePhotoReview(raw({ photos: "x" }), { guide, photoCount: 1 })).toBeNull()
    const result = normalizePhotoReview(raw({ photos: [photo(1), photo(1), photo(7), photo(0)] }), { guide, photoCount: 2 })
    expect(result?.photos.map((entry) => entry.index)).toEqual([1])
    // Motivo sem guia (ex.: SRF7): só as fotos e o motivo decidem.
    expect(normalizePhotoReview(raw({ covered_guide: [] }), { guide: [], photoCount: 3 })?.verdict).toBe("ok")
  })

  it("libera o envio só depois da conferência (ou do 'enviar mesmo assim'); IA indisponível nunca trava", () => {
    const gate = (override: Partial<Parameters<typeof photoReviewGate>[0]>) =>
      photoReviewGate({ photoCount: 2, state: "done", verdict: "ok", acknowledged: false, ...override })
    expect(gate({ photoCount: 0, state: "idle", verdict: null }).blocked).toBe(false)
    expect(gate({ state: "idle", verdict: null }).blocked).toBe(true)
    expect(gate({ state: "running", verdict: null }).reason).toContain("conferindo")
    expect(gate({}).blocked).toBe(false)
    expect(gate({ verdict: "needs_more" }).blocked).toBe(true)
    expect(gate({ verdict: "needs_more" }).reason).toContain("Faltam fotos")
    expect(gate({ verdict: "unusable" }).reason).toContain("não servem de prova")
    expect(gate({ verdict: "needs_more", acknowledged: true }).blocked).toBe(false)
    expect(gate({ state: "unavailable", verdict: null }).blocked).toBe(false)
  })

  it("identifica o conjunto de fotos + motivo", () => {
    expect(photoFingerprint("SRF2", [{ name: "a.jpg", size: 10 }, { name: "b.jpg", size: 20 }])).toBe("SRF2|a.jpg:10,b.jpg:20")
    expect(photoFingerprint("SRF3", [])).toBe("SRF3|")
  })
})

describe("acompanhamento depois do envio", () => {
  const base: FollowUpInput = {
    phase: "reviewed",
    review_kind: "fail",
    review_submitted_at: "2026-10-20T15:00:00.000Z",
    recovered_at: null,
    recovered_amount: null,
    currency_id: "BRL",
    reviews: [review({ stage: "seller_review_pending", seller_status: "claimed" })],
    order_id: 1,
    submittedMode: "appeal",
  }

  it("sem revisão enviada pela maanu não há o que acompanhar", () => {
    expect(returnFollowUp({ ...base, review_kind: null, review_submitted_at: null }, NOW)).toBeNull()
    expect(followUpSummary({ ...base, review_submitted_at: null }, NOW)).toBeNull()
  })

  it("em análise: dias desde o envio, passos, desfechos possíveis e leitura do ML", () => {
    const followUp = returnFollowUp(base, NOW)
    expect(followUp).toMatchObject({ stage: "analyzing", tone: "info", daysSinceSubmit: 3, stale: false, watching: true })
    expect(followUp?.title).toContain("contestação")
    expect(followUp?.description).toContain("O ML não informa o prazo")
    expect(followUp?.badge).toBe("Em análise no ML há 3 dias")
    expect(followUp?.steps.map((step) => [step.key, step.state])).toEqual([
      ["sent", "done"],
      ["analysis", "current"],
      ["decision", "upcoming"],
    ])
    expect(followUp?.nextSteps.join(" ")).toContain("Se o ML ressarcir")
    expect(followUp?.nextSteps.join(" ")).toContain("Se o ML negar")
    expect(returnFollowUp({ ...base, submittedMode: "arrival" }, NOW)?.title).toContain("revisão")
  })

  it("passou de 10 dias sem decisão: pede para atualizar", () => {
    const old = returnFollowUp({ ...base, review_submitted_at: "2026-10-10T15:00:00.000Z" }, NOW)
    expect(old?.stale).toBe(true)
    expect(old?.daysSinceSubmit).toBeGreaterThanOrEqual(STALE_AFTER_DAYS)
    expect(old?.nextSteps[0]).toContain("Toque em “Atualizar”")
    expect(returnFollowUp({ ...base, review_submitted_at: "2026-10-23T14:00:00.000Z" }, NOW)?.badge).toBe("Em análise no ML")
  })

  it("ressarcido, ML negou, certinho e encerrada sem ressarcimento", () => {
    const recovered = returnFollowUp({ ...base, phase: "closed", recovered_at: "2026-10-22T10:00:00.000Z", recovered_amount: 289.9 }, NOW)
    expect(recovered).toMatchObject({ stage: "recovered", tone: "success", watching: false })
    expect(recovered?.badge).toContain("Ressarcido")
    expect(recovered?.steps.every((step) => step.state === "done")).toBe(true)

    const denied = returnFollowUp({ ...base, phase: "closed", reviews: [review({ stage: "closed", seller_status: "success", seller_reason: "x" })] }, NOW)
    expect(denied).toMatchObject({ stage: "denied", tone: "warning", badge: "ML negou", watching: false })
    expect(denied?.steps.at(-1)?.state).toBe("failed")
    expect(denied?.nextSteps.join(" ")).toContain("Contestadas sem sucesso")

    const ok = returnFollowUp({ ...base, review_kind: "ok", reviews: [] }, NOW)
    expect(ok).toMatchObject({ stage: "confirmed_ok", tone: "neutral", watching: false })
    expect(ok?.nextSteps).toEqual([])

    const closed = returnFollowUp({ ...base, phase: "closed", reviews: [] }, NOW)
    expect(closed?.stage).toBe("closed")
    expect(followUpSummary({ ...base, phase: "closed", reviews: [] }, NOW)).toEqual({ stage: "closed", tone: "neutral", badge: "Encerrada" })
  })

  it("usa só a revisão do pedido desta reclamação", () => {
    const other = returnFollowUp({ ...base, reviews: [review({ order_id: 2, seller_status: "success", seller_reason: "x" })] }, NOW)
    expect(other?.stage).toBe("analyzing")
  })
})