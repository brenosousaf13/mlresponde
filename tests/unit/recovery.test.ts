import { describe, expect, it } from "vitest"

import { returnAlerts } from "@/lib/recovery/alerts"
import { fitWithin, photoName } from "@/lib/recovery/images"
import {
  classifyReturn,
  findingRequestText,
  parseReturn,
  parseReturnReviews,
  recoveredByMaanu,
  returnPhase,
  returnsQueue,
  reviewAvailability,
  reviewDeadline,
  type ReturnReview,
} from "@/lib/recovery/returns"
import {
  FALLBACK_REASONS,
  fallbackReturnMessage,
  parseReturnReasons,
  reasonsFor,
  reviewPayload,
  validateReview,
} from "@/lib/recovery/review"
import { buildReturnMessageSystemPrompt, normalizeReturnMessage, type ReturnMessageInput } from "@/lib/recovery/review-ai"
import { ALERT_SEVERITY, RETURN_ALERT_KINDS } from "@/lib/reputation/alerts"
import { alertUrl, buildAlertEmail, recoveryUrl } from "@/lib/reputation/email"

// Formato real lido em 2026-10-20 (dados pessoais trocados por valores fictícios).
const REAL_RETURN = {
  id: 174682035,
  last_updated: "2026-10-18T10:00:00.000-04:00",
  shipments: [
    {
      shipment_id: 1,
      status: "shipped",
      tracking_number: "XX",
      destination: { name: "warehouse", shipping_address: { address_line: "Rua Fictícia 1", zip_code: "00000000" } },
      type: "return",
    },
  ],
  refund_at: "delivered",
  date_closed: null,
  resource_type: "order",
  claim_id: 5592838063,
  status_money: "retained",
  resource_id: 2000018854390840,
  orders: [{ order_id: 2000018854390840, item_id: "MLB5276794474", context_type: "total", total_quantity: "1.0", return_quantity: "1.0" }],
  subtype: "return_total",
  status: "shipped",
  related_entities: null,
  intermediate_check: false,
}

const REAL_REVIEWS = {
  reviews: [
    {
      resource: "order",
      resource_id: 2000018372833248,
      method: "triage",
      resource_reviews: [
        {
          stage: "closed",
          status: "failed",
          product_condition: "unsaleable",
          product_destination: "buyer",
          reason_id: "misused",
          benefited: "seller",
          benefited_type: "",
          seller_status: "",
          seller_reason: "",
          missing_quantity: null,
        },
      ],
      date_created: "2026-09-26T04:02:36.44-04:00",
      last_updated: "2026-09-26T04:02:36.44-04:00",
    },
  ],
}

function review(overrides: Partial<ReturnReview>): ReturnReview {
  return {
    order_id: 1,
    method: "triage",
    stage: "closed",
    status: "success",
    product_condition: "saleable",
    product_destination: "seller",
    reason_id: null,
    benefited: "buyer",
    seller_status: null,
    seller_reason: null,
    updated_at: null,
    ...overrides,
  }
}

describe("parseReturn", () => {
  it("lê a devolução real sem guardar endereço", () => {
    const parsed = parseReturn(REAL_RETURN)
    expect(parsed).toMatchObject({
      returnId: 174682035,
      status: "shipped",
      subtype: "return_total",
      statusMoney: "retained",
      refundAt: "delivered",
      closedAt: null,
      shipmentStatus: "shipped",
      destination: "warehouse",
      isCart: false,
    })
    expect(parsed?.orders).toEqual([{ order_id: 2000018854390840, item_id: "MLB5276794474", return_quantity: 1, total_quantity: 1 }])
    expect(JSON.stringify(parsed)).not.toContain("Fictícia")
    expect(JSON.stringify(parsed)).not.toContain("zip")
  })

  it("carrinho com vários pedidos e resposta vazia", () => {
    const cart = parseReturn({ ...REAL_RETURN, orders: [{ order_id: 1 }, { order_id: 2 }] })
    expect(cart?.isCart).toBe(true)
    expect(parseReturn(null)).toBeNull()
    expect(parseReturn({})).toBeNull()
    expect(parseReturn([REAL_RETURN])?.returnId).toBe(174682035)
  })
})

describe("parseReturnReviews", () => {
  it("normaliza as revisões do armazém", () => {
    expect(parseReturnReviews(REAL_REVIEWS)).toEqual([
      {
        order_id: 2000018372833248,
        method: "triage",
        stage: "closed",
        status: "failed",
        product_condition: "unsaleable",
        product_destination: "buyer",
        reason_id: "misused",
        benefited: "seller",
        seller_status: null,
        seller_reason: null,
        updated_at: new Date("2026-09-26T04:02:36.44-04:00").toISOString(),
      },
    ])
    expect(parseReturnReviews({ reviews: [] })).toEqual([])
    expect(parseReturnReviews(null)).toEqual([])
  })
})

describe("revisão liberada e prazo", () => {
  it("reconhece return_review_ok/fail, com e sem unified, só na reclamação aberta", () => {
    const actions = [
      { action: "send_message_to_complainant", due_date: null },
      { action: "return_review_fail", due_date: null },
      { action: "return_review_unified_ok", due_date: "2026-10-22T12:00:00.000Z" },
    ]
    expect(reviewAvailability(actions, "opened")).toEqual({ ok: true, fail: true, dueDate: "2026-10-22T12:00:00.000Z" })
    expect(reviewAvailability(actions, "closed")).toEqual({ ok: false, fail: false, dueDate: null })
    expect(reviewAvailability([{ action: "refund" }], "opened")).toEqual({ ok: false, fail: false, dueDate: null })
  })

  it("prazo: ação, depois próximo prazo, depois o detail quando a vez é do vendedor", () => {
    const detail = { due_date: "2026-10-23T03:00:00.000Z", action_responsible: "respondent" }
    expect(reviewDeadline({ actionDue: "2026-10-21T00:00:00.000Z", nextDueAt: "2026-10-22T00:00:00.000Z", detail })).toBe(
      "2026-10-21T00:00:00.000Z"
    )
    expect(reviewDeadline({ actionDue: null, nextDueAt: "2026-10-22T00:00:00.000Z", detail })).toBe("2026-10-22T00:00:00.000Z")
    expect(reviewDeadline({ actionDue: null, nextDueAt: null, detail })).toBe("2026-10-23T03:00:00.000Z")
    expect(reviewDeadline({ actionDue: null, nextDueAt: null, detail: { ...detail, action_responsible: "complainant" } })).toBeNull()
    expect(reviewDeadline({ actionDue: null, nextDueAt: null, detail: null })).toBeNull()
  })
})

describe("returnPhase", () => {
  const parsed = parseReturn(REAL_RETURN)
  const base = { claimStatus: "opened", parsed, canReview: false, reviews: [], reviewSubmitted: false }
  it("cobre cada fase", () => {
    expect(returnPhase({ ...base, claimStatus: "closed", canReview: true })).toBe("closed")
    expect(returnPhase({ ...base, parsed: null })).toBe("other")
    expect(returnPhase({ ...base, canReview: true })).toBe("needs_review")
    expect(returnPhase({ ...base, canReview: true, reviewSubmitted: true })).toBe("reviewed")
    expect(returnPhase({ ...base, reviews: [review({ seller_status: "success" })] })).toBe("reviewed")
    expect(returnPhase({ ...base, reviews: [review({ seller_status: "pending" })] })).toBe("at_warehouse")
    expect(returnPhase({ ...base, parsed: parseReturn({ ...REAL_RETURN, shipments: [{ status: "shipped", type: "return", destination: { name: "seller_address" } }] }) })).toBe(
      "waiting"
    )
  })
})

describe("returnsQueue", () => {
  const now = new Date("2026-10-20T12:00:00.000Z")
  it("nunca lidas, depois alteradas, depois abertas vencidas; frescas ficam de fora", () => {
    const claims = [
      { claim_id: 1, status: "opened", ml_updated_at: "2026-10-20T10:00:00.000Z", ml_created_at: "2026-10-01T00:00:00.000Z" },
      { claim_id: 2, status: "closed", ml_updated_at: "2026-10-20T11:00:00.000Z", ml_created_at: "2026-10-02T00:00:00.000Z" },
      { claim_id: 3, status: "closed", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-03T00:00:00.000Z" },
      { claim_id: 4, status: "opened", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-04T00:00:00.000Z" },
      { claim_id: 5, status: "opened", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-05T00:00:00.000Z" },
    ]
    const known = new Map([
      [2, { claim_updated_at: "2026-10-19T00:00:00.000Z", synced_at: "2026-10-19T00:00:00.000Z", phase: "closed" }],
      [3, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-10T00:00:00.000Z", phase: "closed" }],
      [4, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-20T11:55:00.000Z", phase: "waiting" }],
      [5, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-20T11:45:00.000Z", phase: "needs_review" }],
    ])
    expect(returnsQueue(claims, known, now).map((claim) => claim.claim_id)).toEqual([1, 2, 5])
  })
})

describe("Raio-X", () => {
  const base = {
    claimId: 10,
    claimStatus: "closed",
    resolution: { reason: "warehouse_decision", benefited: ["complainant"] },
    amount: 129.9,
    currencyId: "BRL",
    orderId: 99,
    itemTitle: "Tênis",
    statusMoney: "refunded",
  }
  it("sem condição de venda e dinheiro para o comprador = dinheiro sob suspeita", () => {
    const finding = classifyReturn({ ...base, reviews: [review({ product_condition: "unsaleable", benefited: "buyer" })] })
    expect(finding).toMatchObject({ kind: "return_unsaleable_unreimbursed", confidence: "medium", status: "open", amount: 129.9, dedupeKey: "return:10" })
    expect(finding?.evidence).not.toHaveProperty("buyer")
  })
  it("ressarcido pelo ML (caso real) = referência", () => {
    const finding = classifyReturn({ ...base, resolution: { benefited: ["respondent"] }, reviews: parseReturnReviews(REAL_REVIEWS) })
    expect(finding).toMatchObject({ kind: "return_reimbursed", confidence: "high", status: "resolved" })
  })
  it("sem achado: em condição de venda, cobertura do ML, aberta ou sem revisão", () => {
    expect(classifyReturn({ ...base, reviews: [review({})] })).toBeNull()
    expect(
      classifyReturn({ ...base, resolution: { benefited: ["complainant"], applied_coverage: true }, reviews: [review({ product_condition: "discard" })] })
    ).toBeNull()
    expect(classifyReturn({ ...base, claimStatus: "opened", reviews: [review({ product_condition: "unsaleable" })] })).toBeNull()
    expect(classifyReturn({ ...base, reviews: [] })).toBeNull()
  })
  it("texto pronto cita a venda e não tem contato externo", () => {
    const text = findingRequestText({
      kind: "return_unsaleable_unreimbursed",
      evidence: { order_id: 99, item_title: "Tênis", product_condition: "unsaleable", product_destination: "seller" },
    })
    expect(text).toContain("venda 99")
    expect(text).toContain("sem condição de venda")
    expect(text).not.toMatch(/whats|@|http/i)
  })
})

describe("recuperado pela maanu", () => {
  const closed = { claimStatus: "closed", resolution: null }
  it("só conta revisão com problema enviada pela maanu e decidida a favor do vendedor", () => {
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ seller_status: "failed" })] })).toBe(true)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ benefited: "seller" })] })).toBe(true)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [], resolution: { benefited: ["respondent"] } })).toBe(true)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ seller_status: "claimed" })] })).toBe(false)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: false, reviews: [review({ benefited: "seller" })] })).toBe(false)
    expect(recoveredByMaanu({ claimStatus: "opened", resolution: null, maanuFailReview: true, reviews: [review({ benefited: "seller" })] })).toBe(false)
  })
})

describe("alertas do Recuperador", () => {
  const now = new Date("2026-10-20T12:00:00.000Z")
  const row = { id: "row-1", claim_id: 7, phase: "needs_review", deadline_at: "2026-10-23T12:00:00.000Z", item_title: "Tênis", recovered_at: null, recovered_amount: null }
  it("chegou a devolução e prazo vencendo", () => {
    expect(returnAlerts([row], now)).toEqual([
      expect.objectContaining({ kind: "return_review_due", key: "return_review_due:7", data: { return_row_id: "row-1", claim_id: 7 } }),
    ])
    const closing = returnAlerts([{ ...row, deadline_at: "2026-10-21T06:00:00.000Z" }], now)
    expect(closing).toHaveLength(1)
    expect(closing[0]).toMatchObject({ kind: "return_review_closing", key: "return_review_closing:7:2026-10-21T06:00:00.000Z" })
    expect(returnAlerts([{ ...row, phase: "reviewed" }], now)).toEqual([])
  })
  it("ressarcido aparece por 3 dias", () => {
    const recovered = { ...row, phase: "closed", recovered_at: "2026-10-19T12:00:00.000Z", recovered_amount: 129.9 }
    const [alert] = returnAlerts([recovered], now)
    expect(alert).toMatchObject({ kind: "return_recovered", expiresAt: "2026-10-22T12:00:00.000Z" })
    expect(alert.title).toContain("129,90")
    expect(returnAlerts([{ ...recovered, recovered_at: "2026-10-10T12:00:00.000Z" }], now)).toEqual([])
  })
  it("tipos e gravidade", () => {
    expect(RETURN_ALERT_KINDS.map((kind) => ALERT_SEVERITY[kind])).toEqual(["urgent", "urgent", "info"])
  })
})

describe("revisão: motivos, validação e corpo", () => {
  const live = [
    { id: "SRF3", name: "return_incomplete", detail: "A devolução está incompleta", position: 2, apply: ["order"] },
    { id: "SRF2", name: "product_damaged", detail: "O produto chegou avariado", position: 1, apply: ["order"] },
    { id: "SRF7", name: "return_has_not_arrived", detail: "Ainda não chegou", position: 6, apply: ["package"] },
  ]
  const photo = { name: "a.jpg", type: "image/jpeg", size: 300_000 }

  it("motivos do ML na ordem; resposta estranha usa a lista de reserva", () => {
    expect(parseReturnReasons(live).map((reason) => reason.id)).toEqual(["SRF2", "SRF3", "SRF7"])
    expect(parseReturnReasons({ error: "x" })).toEqual(FALLBACK_REASONS)
    expect(parseReturnReasons([{ id: "x y" }])).toEqual(FALLBACK_REASONS)
    expect(reasonsFor(parseReturnReasons(live), false).map((reason) => reason.id)).toEqual(["SRF2", "SRF3"])
    expect(reasonsFor(parseReturnReasons(live), true).map((reason) => reason.id)).toEqual(["SRF7"])
  })

  it("valida antes de falar com o ML", () => {
    const reasons = parseReturnReasons(live)
    const input = { decision: "fail" as const, reasonId: "SRF3", message: "Faltou o carregador.", photos: [], reasons, isCart: false }
    expect(validateReview({ ...input, decision: "ok", reasonId: null })).toBeNull()
    expect(validateReview(input)).toBeNull()
    expect(validateReview({ ...input, reasonId: null })).toBe("Escolha o motivo do problema.")
    expect(validateReview({ ...input, reasonId: "SRF7" })).toBe("Escolha o motivo do problema.")
    expect(validateReview({ ...input, message: "  " })).toBe("Escreva o relato do problema.")
    expect(validateReview({ ...input, message: "Me chama no whatsapp 11 99999-9999" })).toContain("Tire telefone")
    expect(validateReview({ ...input, reasonId: "SRF2" })).toContain("pelo menos uma foto")
    expect(validateReview({ ...input, reasonId: "SRF2", photos: [photo] })).toBeNull()
    expect(validateReview({ ...input, photos: Array.from({ length: 6 }, () => photo) })).toContain("no máximo 5")
    expect(validateReview({ ...input, photos: [{ ...photo, type: "image/heic" }] })).toContain("JPG ou PNG")
    expect(validateReview({ ...input, photos: Array.from({ length: 5 }, () => ({ ...photo, size: 900_000 })) })).toContain("4 MB")
  })

  it("corpo do POST: {} para certinho; motivo, relato e fotos para problema", () => {
    expect(reviewPayload("ok")).toEqual({})
    expect(reviewPayload("fail", { reasonId: "SRF3", message: " Faltou peça. ", attachments: [] })).toEqual([
      { reason: "SRF3", message: "Faltou peça." },
    ])
    expect(reviewPayload("fail", { reasonId: "SRF2", message: "Quebrado", attachments: ["f1.jpg"] })).toEqual([
      { reason: "SRF2", message: "Quebrado", attachments: ["f1.jpg"] },
    ])
  })

  it("relato sem IA usa só os fatos", () => {
    const text = fallbackReturnMessage({ reasonLabel: "O produto chegou avariado", checks: ["Produto quebrado"], notes: "tela trincada", photos: 2 })
    expect(text).toBe(
      "Recebi a devolução e, ao conferir, constatei: O produto chegou avariado. Detalhes: produto quebrado. tela trincada. Envio 2 fotos como evidência. Peço a análise do caso."
    )
  })
})

describe("relato pela IA", () => {
  const input: ReturnMessageInput = {
    storeName: "Loja",
    reasonLabel: "O produto chegou avariado",
    checks: ["Produto quebrado"],
    notes: "",
    photos: 1,
    itemTitle: "Tênis",
    quantity: 1,
  }
  it("aceita o texto da IA e recusa contato externo ou vazio", () => {
    expect(normalizeReturnMessage({ message: "Recebi o produto quebrado. Envio a foto. Peço a análise." }, input)).toEqual({
      message: "Recebi o produto quebrado. Envio a foto. Peço a análise.",
      fromAi: true,
    })
    const contact = normalizeReturnMessage({ message: "Fale comigo em loja@exemplo.com" }, input)
    expect(contact.fromAi).toBe(false)
    expect(contact.message).toContain("constatei")
    expect(normalizeReturnMessage(null, input).fromAi).toBe(false)
    expect(normalizeReturnMessage({ message: "a".repeat(5000) }, input).message.length).toBe(1000)
  })
  it("o prompt proíbe inventar e contato externo", () => {
    const prompt = buildReturnMessageSystemPrompt("Loja")
    expect(prompt).toContain("Nunca invente")
    expect(prompt).toContain("Proibido contato")
  })
})

describe("fotos", () => {
  it("reduz para 1.600 px no maior lado sem aumentar", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(0, 600)).toEqual({ width: 0, height: 0 })
    expect(photoName("IMG_001.HEIC", 0)).toBe("IMG_001.jpg")
    expect(photoName("", 2)).toBe("foto-3.jpg")
  })
})

describe("e-mail das devoluções", () => {
  const site = "https://app.maanu.com.br"
  it("leva ao Recuperador", () => {
    expect(recoveryUrl(site, "acc", [{ return_row_id: "r1" }])).toBe("https://app.maanu.com.br/recuperador/devolucoes/r1?conta=acc")
    expect(recoveryUrl(site, "acc", [{ return_row_id: "r1" }, { return_row_id: "r2" }])).toBe(
      "https://app.maanu.com.br/recuperador?conta=acc&aba=devolucoes"
    )
    expect(alertUrl(site, "return_review_due", "acc", [{ return_row_id: "r1" }])).toContain("/recuperador/devolucoes/r1")
    expect(alertUrl(site, "claim_new", "acc", [{ claim_row_id: "c1" }])).toBe("https://app.maanu.com.br/reputacao/reclamacoes/c1?conta=acc")
    expect(alertUrl(site, "shipment_late", "acc", [{}])).toBe("https://app.maanu.com.br/reputacao?conta=acc")
  })
  it("assunto e botão próprios", () => {
    const email = buildAlertEmail({
      kind: "return_review_due",
      accountName: "LOJA",
      storeName: "Loja",
      items: [{ title: "Chegou a devolução: Tênis", body: "Confira" }],
      url: site + "/recuperador",
    })
    expect(email.subject).toBe("Chegou uma devolução para revisar na LOJA · maanu")
    expect(email.html).toContain("Abrir o Recuperador na maanu")
    const claim = buildAlertEmail({ kind: "claim_new", accountName: "LOJA", storeName: "Loja", items: [{ title: "x", body: "y" }], url: site })
    expect(claim.html).toContain("Abrir a Reputação na maanu")
  })
})
