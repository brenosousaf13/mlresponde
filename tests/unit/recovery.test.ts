import { describe, expect, it } from "vitest"

import { returnAlerts } from "@/lib/recovery/alerts"
import { fitWithin, photoName } from "@/lib/recovery/images"
import {
  appealStrength,
  cartOrderIds,
  classifyReturn,
  findingOutcome,
  findingRequestText,
  ownReviews,
  parseReturn,
  parseReturnReviews,
  recoveredByMaanu,
  refreshInterval,
  returnAmount,
  returnPhase,
  returnsQueue,
  reviewAvailability,
  reviewDeadline,
  reviewMode,
  rowReviewMode,
  triageAwaitingSeller,
  type KnownReturn,
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

// Casos reais lidos em 2026-10-20 (só GET, contas de clientes; endereços e compradores removidos).
// 1) Contestação: reclamação ENCERRADA pelo armazém (Full), dinheiro devolvido ao comprador, return_review_fail liberado.
const APPEAL_RETURN = {
  id: 174484425,
  shipments: [{ shipment_id: 1, status: "delivered", type: "return", destination: { name: "warehouse", shipping_address: { zip_code: "0" } } }],
  refund_at: "shipped",
  date_closed: "2026-10-14T12:04:14.453-04:00",
  status_money: "refunded",
  orders: [{ order_id: 2000018903159666, item_id: "MLB4091964641", context_type: "total", total_quantity: "1.0", return_quantity: "1.0" }],
  subtype: "return_total",
  status: "delivered",
  related_entities: ["reviews"],
  intermediate_check: false,
}
const APPEAL_REVIEWS = {
  reviews: [
    {
      resource: "order",
      resource_id: 2000018903159666,
      method: "triage",
      resource_reviews: [
        {
          stage: "seller_review_pending",
          status: "success",
          product_condition: "unsaleable",
          product_destination: "seller",
          reason_id: "damaged",
          benefited: "buyer",
          benefited_type: "",
          benefited_reason: "",
          seller_status: "pending",
          seller_reason: "",
          missing_quantity: null,
        },
      ],
      date_created: "2026-10-15T23:50:02.579-04:00",
      last_updated: "2026-10-15T23:50:02.579-04:00",
    },
  ],
}
const APPEAL_RESOLUTION = {
  reason: "warehouse_decision",
  date_created: "2026-10-15T23:50:03.000-04:00",
  benefited: ["complainant"],
  closed_by: "mediator",
  applied_coverage: true,
}
// 2) Chegou ao vendedor: reclamação aberta, pacote entregue no endereço da loja, prazo no detail (responsible "complainant").
const ARRIVAL_RETURN = {
  id: 174593977,
  shipments: [{ shipment_id: 2, status: "delivered", type: "return", destination: { name: "seller_address" } }],
  refund_at: "delivered",
  status_money: "retained",
  orders: [{ order_id: 2000018652964544, item_id: "MLB3385510589", total_quantity: "1.0", return_quantity: "1.0" }],
  subtype: "return_total",
  status: "delivered",
}
const ARRIVAL_DETAIL = {
  due_date: "2026-10-23T22:00:00.000-04:00",
  action_responsible: "complainant",
  title: "Devolução para revisar até sexta-feira",
}
const ARRIVAL_ACTIONS = [
  { action: "send_message_to_complainant", mandatory: false, due_date: null },
  { action: "open_dispute", mandatory: false, due_date: null },
  { action: "return_review_fail", mandatory: false, due_date: null },
  { action: "return_review_ok", mandatory: false, due_date: null },
  { action: "refund", mandatory: false, due_date: null },
  { action: "return_review_unified_fail", mandatory: false, due_date: null },
  { action: "return_review_unified_ok", mandatory: false, due_date: null },
]
// 3) A caminho do armazém: o ML já lista return_review_ok/fail, mas o vendedor não tem o produto.
const TRANSIT_RETURN = {
  id: 174607875,
  shipments: [{ shipment_id: 3, status: "shipped", type: "return", destination: { name: "warehouse" } }],
  status_money: "retained",
  orders: [{ order_id: 2000018885782036, total_quantity: "1.0", return_quantity: "1.0" }],
  status: "shipped",
}
// 4) Carrinho: a devolução 167139552 junta 2 pedidos (2 reclamações); /reviews traz os dois, /returns só o da reclamação.
const CART_REVIEWS = {
  reviews: [2000018789678044, 2000018789674112].map((order) => ({
    resource: "order",
    resource_id: order,
    method: "triage",
    resource_reviews: [
      {
        stage: "seller_review_pending",
        status: "success",
        product_condition: "unsaleable",
        product_destination: "seller",
        reason_id: "other_attribute",
        benefited: "buyer",
        seller_status: "pending",
        seller_reason: "",
      },
    ],
    date_created: "2026-10-19T16:43:10.505-04:00",
    last_updated: "2026-10-19T16:43:10.505-04:00",
  })),
}

function modeOf(raw: unknown, actions: { action: string }[], reviews: ReturnReview[]) {
  const parsed = parseReturn(raw as never)
  const availability = reviewAvailability(actions)
  return reviewMode({
    hasOk: availability.ok,
    hasFail: availability.fail,
    destination: parsed?.destination ?? null,
    shipmentStatus: parsed?.shipmentStatus ?? null,
    returnStatus: parsed?.status ?? null,
    reviews,
  })
}

describe("o que o vendedor pode fazer agora (casos reais)", () => {
  it("reconhece as ações de revisão com e sem unified, com a reclamação aberta ou encerrada", () => {
    expect(reviewAvailability(ARRIVAL_ACTIONS)).toEqual({ ok: true, fail: true, dueDate: null })
    expect(reviewAvailability([{ action: "return_review_fail", due_date: null }])).toEqual({ ok: false, fail: true, dueDate: null })
    expect(reviewAvailability([{ action: "return_review_unified_ok", due_date: "2026-10-22T12:00:00.000Z" }])).toEqual({
      ok: true,
      fail: false,
      dueDate: "2026-10-22T12:00:00.000Z",
    })
    expect(reviewAvailability([{ action: "refund" }])).toEqual({ ok: false, fail: false, dueDate: null })
  })

  it("chegou ao endereço do vendedor = revisar; prazo do detail mesmo com action_responsible complainant", () => {
    expect(modeOf(ARRIVAL_RETURN, ARRIVAL_ACTIONS, [])).toBe("arrival")
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: ARRIVAL_DETAIL, reviews: [] })).toEqual({
      at: "2026-10-24T02:00:00.000Z",
      estimated: false,
    })
    // Já revisada pelo vendedor no ML: não pede de novo.
    expect(modeOf(ARRIVAL_RETURN, ARRIVAL_ACTIONS, [review({ method: "none", stage: null, seller_status: "success" })])).toBeNull()
  })

  it("a caminho do armazém com as ações listadas NÃO pede revisão (o vendedor não tem o produto)", () => {
    expect(modeOf(TRANSIT_RETURN, ARRIVAL_ACTIONS.slice(0, 5), [])).toBeNull()
    expect(
      returnPhase({ claimStatus: "opened", parsed: parseReturn(TRANSIT_RETURN), mode: null, reviews: [], reviewSubmitted: false })
    ).toBe("at_warehouse")
  })

  it("reclamação encerrada pelo armazém com return_review_fail = contestar; prazo estimado em 60 dias", () => {
    const reviews = parseReturnReviews(APPEAL_REVIEWS)
    expect(triageAwaitingSeller(reviews)).toMatchObject({ stage: "seller_review_pending", seller_status: "pending" })
    const mode = modeOf(APPEAL_RETURN, [{ action: "return_review_fail" }], reviews)
    expect(mode).toBe("appeal")
    expect(returnPhase({ claimStatus: "closed", parsed: parseReturn(APPEAL_RETURN), mode, reviews, reviewSubmitted: false })).toBe(
      "needs_review"
    )
    const deadline = reviewDeadline({ mode, actionDue: null, nextDueAt: null, detail: { due_date: null }, reviews })
    expect(deadline).toEqual({ at: new Date(Date.parse("2026-10-15T23:50:02.579-04:00") + 60 * 86_400_000).toISOString(), estimated: true })
    // Contestação só oferece "com problema" e some quando o ML tira a ação ou a revisão sai de seller_review_pending.
    expect(modeOf(APPEAL_RETURN, [], reviews)).toBeNull()
    expect(modeOf(APPEAL_RETURN, [{ action: "return_review_fail" }], [review({ stage: "closed", seller_status: "success" })])).toBeNull()
  })

  it("a linha gravada dá o mesmo resultado (telas e alertas)", () => {
    expect(
      rowReviewMode({
        can_review_ok: false,
        can_review_fail: true,
        destination: "warehouse",
        shipment_status: "delivered",
        return_status: "delivered",
        reviews: parseReturnReviews(CART_REVIEWS),
        order_id: 2000018789678044,
      })
    ).toBe("appeal")
  })
})

describe("carrinho: revisão de cada pedido", () => {
  const reviews = parseReturnReviews(CART_REVIEWS)
  it("usa só a revisão do pedido da reclamação e detecta o carrinho pelas revisões ou pelas outras reclamações", () => {
    expect(ownReviews(reviews, 2000018789674112).map((item) => item.order_id)).toEqual([2000018789674112])
    expect(ownReviews(reviews, null)).toHaveLength(2)
    expect(cartOrderIds({ orders: [{ order_id: 2000018789678044 }], reviews })).toEqual([2000018789674112, 2000018789678044])
    expect(cartOrderIds({ orders: [{ order_id: 1 }], reviews: [], siblingOrderIds: [2, null] })).toEqual([1, 2])
    expect(cartOrderIds({ orders: [{ order_id: 1 }], reviews: [] })).toEqual([1])
  })
  it("a revisão do outro pedido não decide esta reclamação", () => {
    const other = [review({ order_id: 2, stage: "seller_review_pending", seller_status: "pending", product_condition: "unsaleable" })]
    expect(ownReviews(other, 1)).toEqual([])
    expect(
      classifyReturn({
        claimId: 1,
        claimStatus: "closed",
        resolution: APPEAL_RESOLUTION,
        reviews: ownReviews(other, 1),
        mode: null,
        amount: 50,
        currencyId: "BRL",
        orderId: 1,
        itemTitle: null,
        statusMoney: "refunded",
      })
    ).toBeNull()
  })
})

describe("parseReturn: trecho atual do envio", () => {
  it("depois da revisão do armazém vale o envio para o vendedor (return_from_triage)", () => {
    const parsed = parseReturn({
      id: 1,
      status: "delivered",
      shipments: [
        { status: "delivered", type: "return", destination: { name: "warehouse" } },
        { status: "pending", type: "return_from_triage", destination: { name: "seller_address" } },
      ],
    })
    expect(parsed).toMatchObject({ destination: "seller_address", shipmentStatus: "pending", viaTriage: true })
  })
})

describe("returnPhase", () => {
  const parsed = parseReturn(REAL_RETURN)
  const base = { claimStatus: "opened", parsed, mode: null, reviews: [], reviewSubmitted: false }
  it("cobre cada fase", () => {
    expect(returnPhase({ ...base, claimStatus: "closed" })).toBe("closed")
    expect(returnPhase({ ...base, claimStatus: "closed", mode: "arrival" })).toBe("needs_review")
    expect(returnPhase({ ...base, parsed: null })).toBe("other")
    expect(returnPhase({ ...base, mode: "arrival" })).toBe("needs_review")
    expect(returnPhase({ ...base, mode: "arrival", reviewSubmitted: true })).toBe("reviewed")
    expect(returnPhase({ ...base, reviews: [review({ method: "none", seller_status: "success" })] })).toBe("reviewed")
    expect(returnPhase({ ...base, reviews: [review({ seller_status: "pending" })] })).toBe("at_warehouse")
    expect(
      returnPhase({
        ...base,
        parsed: parseReturn({ ...REAL_RETURN, shipments: [{ status: "shipped", type: "return", destination: { name: "seller_address" } }] }),
      })
    ).toBe("waiting")
    // Contestação enviada numa reclamação encerrada: em análise até o ML decidir.
    expect(returnPhase({ ...base, claimStatus: "closed", mode: "appeal", reviewSubmitted: true })).toBe("reviewed")
    expect(returnPhase({ ...base, claimStatus: "closed", reviews: [review({ seller_status: "claimed" })] })).toBe("reviewed")
    expect(returnPhase({ ...base, claimStatus: "closed", reviewSubmitted: true, reviews: [review({ seller_status: "failed" })] })).toBe(
      "closed"
    )
  })
})

describe("valor em jogo", () => {
  const summary = { total_amount: 120, items: [{ quantity: 3, unit_price: 40 }] }
  it("total da venda; parcial = preço unitário × unidades devolvidas", () => {
    expect(returnAmount(summary, { return_quantity: 3, total_quantity: 3 })).toBe(120)
    expect(returnAmount(summary, { return_quantity: 1, total_quantity: 3 })).toBe(40)
    expect(returnAmount(null, { return_quantity: 1, total_quantity: 1 })).toBeNull()
    expect(returnAmount({ total_amount: 99.9, items: [] }, null)).toBe(99.9)
  })
})

describe("returnsQueue", () => {
  const now = new Date("2026-10-20T12:00:00.000Z")
  it("revisão liberada primeiro; depois nunca lidas, alteradas, vencidas pelo intervalo e o resto da regra antiga", () => {
    const claims = [
      { claim_id: 1, status: "opened", ml_updated_at: "2026-10-20T10:00:00.000Z", ml_created_at: "2026-10-01T00:00:00.000Z" },
      { claim_id: 2, status: "closed", ml_updated_at: "2026-10-20T11:00:00.000Z", ml_created_at: "2026-10-02T00:00:00.000Z" },
      { claim_id: 3, status: "closed", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-03T00:00:00.000Z" },
      { claim_id: 4, status: "opened", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-04T00:00:00.000Z" },
      { claim_id: 5, status: "opened", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-05T00:00:00.000Z" },
      // Encerrada com contestação liberada, lida pela regra antiga: sobe na fila.
      { claim_id: 6, status: "closed", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-06T00:00:00.000Z", hasReviewAction: true },
      // Contestação já na regra nova, lida há 30 min: espera a hora.
      { claim_id: 7, status: "closed", ml_updated_at: "2026-10-10T00:00:00.000Z", ml_created_at: "2026-10-07T00:00:00.000Z", hasReviewAction: true },
    ]
    const known = new Map<number, KnownReturn>([
      [2, { claim_updated_at: "2026-10-19T00:00:00.000Z", synced_at: "2026-10-19T00:00:00.000Z", phase: "closed" }],
      [3, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-10T00:00:00.000Z", phase: "closed", return_status: "delivered" }],
      [4, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-20T11:55:00.000Z", phase: "waiting" }],
      [5, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-20T11:45:00.000Z", phase: "needs_review", mode: "arrival" }],
      [6, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-10T00:00:00.000Z", phase: "closed", return_status: "delivered" }],
      [7, { claim_updated_at: "2026-10-10T00:00:00.000Z", synced_at: "2026-10-20T11:30:00.000Z", phase: "needs_review", mode: "appeal" }],
    ])
    expect(returnsQueue(claims, known, now).map((claim) => claim.claim_id)).toEqual([1, 2, 5])
    expect(returnsQueue(claims, known, now, "2026-10-20T11:50:00.000Z").map((claim) => claim.claim_id)).toEqual([7, 6, 1, 2, 5, 3])
    // Nunca lida com revisão liberada passa na frente das nunca lidas sem revisão (backlog do Raio-X).
    const backlog = [
      { claim_id: 20, status: "closed", ml_updated_at: null, ml_created_at: "2026-10-10T00:00:00.000Z" },
      { claim_id: 21, status: "closed", ml_updated_at: null, ml_created_at: "2026-09-10T00:00:00.000Z", hasReviewAction: true },
    ]
    expect(returnsQueue(backlog, new Map(), now).map((claim) => claim.claim_id)).toEqual([21, 20])
  })
  it("intervalos por situação", () => {
    expect(refreshInterval("opened", { claim_updated_at: null, synced_at: "", phase: "needs_review", mode: "arrival" })).toBe(10 * 60_000)
    expect(refreshInterval("closed", { claim_updated_at: null, synced_at: "", phase: "needs_review", mode: "appeal" })).toBe(60 * 60_000)
    expect(refreshInterval("closed", { claim_updated_at: null, synced_at: "", phase: "reviewed" })).toBe(60 * 60_000)
    expect(refreshInterval("closed", { claim_updated_at: null, synced_at: "", phase: "closed", return_status: "shipped" })).toBe(60 * 60_000)
    expect(refreshInterval("closed", { claim_updated_at: null, synced_at: "", phase: "closed", return_status: "delivered" })).toBeNull()
  })
})

describe("Raio-X", () => {
  const base = {
    claimId: 10,
    claimStatus: "closed",
    resolution: APPEAL_RESOLUTION,
    mode: null,
    amount: 129.9,
    currencyId: "BRL",
    orderId: 99,
    itemTitle: "Tênis",
    statusMoney: "refunded",
    buyerReason: "A minha compra chegou em boas condições, mas eu não a quero mais",
  }
  const pending = parseReturnReviews(APPEAL_REVIEWS)
  it("caso real: applied_coverage true com o dinheiro do comprador e contestação liberada = dá para contestar", () => {
    const finding = classifyReturn({ ...base, reviews: pending, mode: "appeal", deadlineAt: "2026-12-15T03:50:02.579Z" })
    expect(finding).toMatchObject({
      kind: "return_unsaleable_unreimbursed",
      outcome: "contestable",
      status: "open",
      confidence: "high",
      amount: 129.9,
      dedupeKey: "return:10",
    })
    expect(finding?.evidence).toMatchObject({ outcome: "contestable", reason_id: "damaged", deadline_at: "2026-12-15T03:50:02.579Z" })
    expect(JSON.stringify(finding?.evidence)).not.toMatch(/nickname|buyer_id/)
  })
  it("ressarcido (benefited seller/both ou o representante deu razão ao vendedor) = referência", () => {
    expect(classifyReturn({ ...base, resolution: { benefited: ["respondent"] }, reviews: parseReturnReviews(REAL_REVIEWS) })).toMatchObject({
      kind: "return_reimbursed",
      outcome: "reimbursed",
      status: "resolved",
    })
    // Exemplo da documentação: armazém deu ao comprador, o vendedor contestou (SRF2) e ganhou (seller_status failed).
    const won = [review({ stage: "", product_condition: "unsaleable", benefited: "buyer", seller_status: "failed", seller_reason: "SRF2" })]
    expect(classifyReturn({ ...base, reviews: won })?.outcome).toBe("reimbursed")
    expect(classifyReturn({ ...base, reviews: [review({ product_condition: "discard", benefited: "both" })] })?.outcome).toBe("reimbursed")
  })
  it("contestação em análise, contestação perdida e prazo encerrado", () => {
    const claimed = [review({ product_condition: "unsaleable", seller_status: "claimed", seller_reason: "SRF2" })]
    expect(classifyReturn({ ...base, reviews: claimed })).toMatchObject({ outcome: "appealed", status: "open" })
    const lostAppeal = [review({ product_condition: "unsaleable", stage: "closed", seller_status: "success", seller_reason: "SRF2" })]
    expect(classifyReturn({ ...base, reviews: lostAppeal })).toMatchObject({ outcome: "appeal_lost", status: "resolved", confidence: "low" })
    const timeout = [review({ product_condition: "unsaleable", reason_id: "misused", stage: "timeout", seller_status: "success" })]
    expect(classifyReturn({ ...base, reviews: timeout })).toMatchObject({ outcome: "expired", status: "resolved", confidence: "high" })
  })
  it("sem achado: em condição de venda, sem revisão ou aberta esperando o armazém", () => {
    expect(classifyReturn({ ...base, reviews: [review({})] })).toBeNull()
    expect(classifyReturn({ ...base, reviews: [] })).toBeNull()
    expect(
      classifyReturn({ ...base, claimStatus: "opened", reviews: [review({ product_condition: "unsaleable", stage: "seller_review_pending" })] })
    ).toBeNull()
  })
  it("força da contestação", () => {
    expect(appealStrength("A minha compra chegou em boas condições, mas eu não a quero mais", "damaged")).toBe("high")
    expect(appealStrength("É menor do que eu imaginava", "misused")).toBe("high")
    expect(appealStrength("A minha compra chegou em boas condições, mas eu não a quero mais", "other_attribute")).toBe("medium")
    expect(appealStrength("O produto veio com defeito", "damaged")).toBe("low")
    expect(appealStrength("Chegou em boas condições", "not_working")).toBe("low")
    expect(appealStrength(null, "damaged")).toBe("medium")
  })
  it("achado antigo sem outcome continua legível", () => {
    expect(findingOutcome({ kind: "return_unsaleable_unreimbursed", status: "open", evidence: {} })).toBe("contestable")
    expect(findingOutcome({ kind: "return_reimbursed", status: "resolved", evidence: {} })).toBe("reimbursed")
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
  const closed = { claimStatus: "closed", resolution: null, submittedAt: "2026-10-20T12:00:00.000Z" }
  it("só conta revisão com problema enviada pela maanu e decidida a favor do vendedor depois do envio", () => {
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ seller_status: "failed" })] })).toBe(true)
    expect(
      recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ benefited: "seller", updated_at: "2026-10-21T00:00:00.000Z" })] })
    ).toBe(true)
    expect(
      recoveredByMaanu({
        ...closed,
        maanuFailReview: true,
        reviews: [],
        resolution: { benefited: ["respondent"], date_created: "2026-10-22T00:00:00.000Z" },
      })
    ).toBe(true)
    // Resolução anterior ao envio (a reclamação já tinha fechado): não é mérito da maanu.
    expect(
      recoveredByMaanu({
        ...closed,
        maanuFailReview: true,
        reviews: [],
        resolution: { benefited: ["complainant", "respondent"], date_created: "2026-10-15T00:00:00.000Z" },
      })
    ).toBe(false)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: true, reviews: [review({ seller_status: "claimed" })] })).toBe(false)
    expect(recoveredByMaanu({ ...closed, maanuFailReview: false, reviews: [review({ seller_status: "failed" })] })).toBe(false)
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
  it("contestação do armazém tem texto próprio, com o valor e o prazo estimado", () => {
    const appeal = { ...row, mode: "appeal" as const, amount: 62, deadline_at: "2026-12-14T03:50:00.000Z" }
    const [alert] = returnAlerts([appeal], now)
    expect(alert).toMatchObject({ kind: "return_review_due", key: "return_review_due:7" })
    expect(alert.title).toContain("Dá para contestar")
    expect(alert.title).toContain("62,00")
    expect(alert.body).toContain("prazo estimado")
    const [closing] = returnAlerts([{ ...appeal, deadline_at: "2026-10-21T06:00:00.000Z" }], now)
    expect(closing).toMatchObject({ kind: "return_review_closing" })
    expect(closing.title).toContain("Conteste até")
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
    // Pedido só = pacote inteiro: todos os motivos (inclusive "Ainda não chegou"). Carrinho: só motivos de pedido (com order_id).
    expect(reasonsFor(parseReturnReasons(live), false).map((reason) => reason.id)).toEqual(["SRF2", "SRF3", "SRF7"])
    expect(reasonsFor(parseReturnReasons(live), true).map((reason) => reason.id)).toEqual(["SRF2", "SRF3"])
  })

  it("valida antes de falar com o ML", () => {
    const reasons = parseReturnReasons(live)
    const input = { decision: "fail" as const, reasonId: "SRF3", message: "Faltou o carregador.", photos: [], reasons, isCart: false }
    expect(validateReview({ ...input, decision: "ok", reasonId: null })).toBeNull()
    expect(validateReview(input)).toBeNull()
    expect(validateReview({ ...input, reasonId: null })).toBe("Escolha o motivo do problema.")
    expect(validateReview({ ...input, reasonId: "SRF7" })).toBeNull()
    expect(validateReview({ ...input, reasonId: "SRF7", isCart: true })).toBe("Escolha o motivo do problema.")
    expect(validateReview({ ...input, message: "  " })).toBe("Escreva o relato do problema.")
    expect(validateReview({ ...input, message: "Me chama no whatsapp 11 99999-9999" })).toContain("Tire telefone")
    expect(validateReview({ ...input, reasonId: "SRF2" })).toContain("pelo menos uma foto")
    expect(validateReview({ ...input, reasonId: "SRF2", photos: [photo] })).toBeNull()
    expect(validateReview({ ...input, photos: Array.from({ length: 6 }, () => photo) })).toContain("no máximo 5")
    expect(validateReview({ ...input, photos: [{ ...photo, type: "image/heic" }] })).toContain("JPG ou PNG")
    expect(validateReview({ ...input, photos: Array.from({ length: 5 }, () => ({ ...photo, size: 900_000 })) })).toContain("4 MB")
  })

  it("corpo do POST: [] para certinho ({} o ML recusa); motivo, relato e fotos para problema", () => {
    expect(reviewPayload("ok")).toEqual([])
    expect(reviewPayload("fail", { reasonId: "SRF3", message: " Faltou peça. ", attachments: [] })).toEqual([
      { reason: "SRF3", message: "Faltou peça." },
    ])
    expect(reviewPayload("fail", { reasonId: "SRF2", message: "Quebrado", attachments: ["f1.jpg"] })).toEqual([
      { reason: "SRF2", message: "Quebrado", attachments: ["f1.jpg"] },
    ])
    // Carrinho: revisa só o pedido desta reclamação (formato da documentação).
    expect(reviewPayload("fail", { reasonId: "SRF2", message: "Quebrado", attachments: ["f1.jpg"], orderId: 2000011248679992 })).toEqual([
      { reason: "SRF2", message: "Quebrado", attachments: ["f1.jpg"], order_id: 2000011248679992 },
    ])
    expect(reviewPayload("ok", { reasonId: "SRF2", message: "x", attachments: [], orderId: 1 })).toEqual([])
  })

  it("relato sem IA usa só os fatos", () => {
    const text = fallbackReturnMessage({ reasonLabel: "O produto chegou avariado", checks: ["Produto quebrado"], notes: "tela trincada", photos: 2 })
    expect(text).toBe(
      "Recebi a devolução e, ao conferir, constatei: O produto chegou avariado. Detalhes: produto quebrado. tela trincada. Envio 2 fotos como evidência. Peço a análise do caso."
    )
    const appeal = fallbackReturnMessage({ reasonLabel: "O produto chegou avariado", checks: [], notes: "", photos: 0, appeal: true })
    expect(appeal).toBe(
      "Contesto a revisão desta devolução. O motivo que selecionei foi: O produto chegou avariado. Peço a análise do caso e o ressarcimento do valor da venda."
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
    expect(email.subject).toBe("Uma devolução para revisar ou contestar na LOJA · maanu")
    expect(email.html).toContain("Abrir o Recuperador na maanu")
    const claim = buildAlertEmail({ kind: "claim_new", accountName: "LOJA", storeName: "Loja", items: [{ title: "x", body: "y" }], url: site })
    expect(claim.html).toContain("Abrir a Reputação na maanu")
  })
})
