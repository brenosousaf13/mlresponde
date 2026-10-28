import { describe, expect, it } from "vitest"

import {
  buildRecoveryScreenData,
  classifyQueueItem,
  sortReviewQueue,
  summarizeQueueGroups,
  type ReviewQueueItem,
} from "@/lib/recovery/contract"
import { recoveryBadgeCount, reviewBannerSecondary, reviewBannerText } from "@/lib/recovery/banner"
import { isQuickConfirmBatchEligible, validateConfirmReceiptBatch } from "@/lib/recovery/batch"
import { photoSubmissionGate } from "@/lib/recovery/photo-review"
import { fallbackReturnMessage, suggestFailReason, type ReturnReason } from "@/lib/recovery/review"

const reasons: ReturnReason[] = [
  { id: "SRF2", label: "Produto avariado", apply: ["order"], position: 1 },
  { id: "SRF3", label: "Devolução incompleta", apply: ["order"], position: 2 },
  { id: "SRF4", label: "Produto diferente", apply: ["order"], position: 3 },
  { id: "SRF5", label: "Produto não está no pacote", apply: ["order"], position: 4 },
  { id: "SRF6", label: "Outro defeito", apply: ["order"], position: 5 },
]

describe("sugestão de motivo da revisão", () => {
  it("mapeia todos os vereditos da triagem para motivos aceitos", () => {
    expect(suggestFailReason({ warehouseReasonId: "different_product", productCondition: null, buyerReason: null, reasons })).toBe("SRF4")
    expect(suggestFailReason({ warehouseReasonId: "incomplete", productCondition: null, buyerReason: null, reasons })).toBe("SRF3")
    expect(suggestFailReason({ warehouseReasonId: "missing", productCondition: null, buyerReason: null, reasons })).toBe("SRF5")
    expect(suggestFailReason({ warehouseReasonId: "misused", productCondition: null, buyerReason: null, reasons })).toBe("SRF2")
    expect(suggestFailReason({ warehouseReasonId: "not_working", productCondition: null, buyerReason: null, reasons })).toBe("SRF2")
    expect(suggestFailReason({ warehouseReasonId: "blocked", productCondition: null, buyerReason: null, reasons })).toBe("SRF6")
    expect(suggestFailReason({ warehouseReasonId: "open_box", productCondition: null, buyerReason: null, reasons })).toBe("SRF2")
    expect(suggestFailReason({ warehouseReasonId: "discard", productCondition: null, buyerReason: null, reasons })).toBe("SRF6")
  })

  it("usa dados disponíveis da devolução quando não há reason_id de triagem", () => {
    expect(suggestFailReason({ warehouseReasonId: null, productCondition: "missing", buyerReason: null, reasons })).toBe("SRF5")
    expect(suggestFailReason({ warehouseReasonId: null, productCondition: "unsaleable", buyerReason: "veio quebrado", reasons })).toBe("SRF2")
    expect(suggestFailReason({ warehouseReasonId: null, productCondition: null, buyerReason: "outro modelo", reasons })).toBe("SRF4")
  })

  it("só retorna ids presentes na lista do Mercado Livre", () => {
    expect(suggestFailReason({ warehouseReasonId: "different_product", productCondition: null, buyerReason: null, reasons: reasons.filter((item) => item.id !== "SRF4") })).toBeNull()
    expect(suggestFailReason({ warehouseReasonId: "default", productCondition: null, buyerReason: null, reasons })).toBeNull()
  })
})

describe("relato sem IA", () => {
  it("não inventa fatos além do motivo, marcações, observações e fotos do vendedor", () => {
    const text = fallbackReturnMessage({ reasonLabel: "Produto avariado", checks: ["Produto quebrado"], notes: "tela trincada", photos: 2 })
    expect(text).toContain("Produto avariado")
    expect(text).toContain("produto quebrado")
    expect(text).toContain("tela trincada")
    expect(text).toContain("2 fotos")
    expect(text).not.toMatch(/comprador|data|prazo|valor|número de série|marca/i)
  })
})

describe("confirmação de envio sem fotos", () => {
  it("bloqueia sem foto até o vendedor confirmar o risco", () => {
    expect(photoSubmissionGate({ photoCount: 0, acknowledged: false })).toMatchObject({ blocked: true })
    expect(photoSubmissionGate({ photoCount: 0, acknowledged: true })).toMatchObject({ blocked: false })
    expect(photoSubmissionGate({ photoCount: 1, acknowledged: false })).toMatchObject({ blocked: false })
  })
})

describe("fila de revisão", () => {
  const item = (overrides: Partial<ReviewQueueItem> & { claimCreatedAt?: string | null }): ReviewQueueItem & { claimCreatedAt?: string | null } => ({
    id: "id",
    claimId: 1,
    title: "Produto",
    amount: 10,
    currencyId: "BRL",
    deadlineAt: null,
    deadlineEstimated: false,
    mode: "arrival",
    statusMoney: "refunded",
    recommendation: "chegou_certinho",
    actionGroup: "confirm_receipt",
    confidence: "low",
    suggestionLabel: "Chegou certinho",
    reasonShort: "Confira o pacote.",
    recoverableAmount: null,
    quickConfirmAvailable: true,
    href: "/recuperador/devolucoes/id",
    ...overrides,
  })

  it("ordena prazo, depois valor e depois claim_created_at", () => {
    const rows = [
      item({ id: "sem-prazo", claimId: 4, amount: 999, claimCreatedAt: "2026-10-28T10:00:00Z" }),
      item({ id: "tarde", claimId: 3, amount: 400, deadlineAt: "2026-11-02T00:00:00Z", claimCreatedAt: "2026-10-28T09:00:00Z" }),
      item({ id: "cedo-menor", claimId: 2, amount: 50, deadlineAt: "2026-10-30T00:00:00Z", claimCreatedAt: "2026-10-28T12:00:00Z" }),
      item({ id: "cedo-maior", claimId: 1, amount: 100, deadlineAt: "2026-10-30T00:00:00Z", claimCreatedAt: "2026-10-28T08:00:00Z" }),
    ]
    expect(sortReviewQueue(rows).map((row) => row.id)).toEqual(["cedo-maior", "cedo-menor", "tarde", "sem-prazo"])
  })
})

describe("classificação determinística da fila", () => {
  const suggestion = (action: "contest" | "partial_refund" | "do_not_contest") => ({ action, reason: "Motivo longo e verificável para a linha.", confidence: "medium" as const })
  const queueItem = (overrides: Partial<ReviewQueueItem>): ReviewQueueItem => ({
    id: "id",
    claimId: 1,
    title: "Produto",
    amount: 10,
    currencyId: "BRL",
    deadlineAt: null,
    deadlineEstimated: false,
    mode: "arrival",
    statusMoney: "refunded",
    recommendation: "chegou_certinho",
    actionGroup: "confirm_receipt",
    confidence: "low",
    suggestionLabel: "Chegou certinho",
    reasonShort: "Confira o pacote.",
    recoverableAmount: null,
    quickConfirmAvailable: true,
    href: "/recuperador/devolucoes/id",
    ...overrides,
  })

  it("mapeia todas as recomendações para os grupos e rótulos", () => {
    expect(classifyQueueItem({ mode: "appeal", amount: 100, canReviewOk: true, suggestion: suggestion("contest") })).toMatchObject({
      recommendation: "contestar",
      actionGroup: "recover",
      recoverableAmount: 100,
      quickConfirmAvailable: false,
    })
    expect(classifyQueueItem({ mode: "arrival", amount: 100, canReviewOk: true, suggestion: suggestion("partial_refund") })).toMatchObject({
      recommendation: "ressarcimento_parcial",
      actionGroup: "recover",
      recoverableAmount: 100,
    })
    expect(classifyQueueItem({ mode: "arrival", amount: 100, canReviewOk: true, suggestion: suggestion("do_not_contest") })).toMatchObject({
      recommendation: "chegou_certinho",
      actionGroup: "confirm_receipt",
      recoverableAmount: null,
      quickConfirmAvailable: true,
    })
  })

  it("mantém appeal no grupo recover mesmo quando a regra recomenda não contestar", () => {
    expect(classifyQueueItem({ mode: "appeal", amount: 80, canReviewOk: true, suggestion: suggestion("do_not_contest") })).toMatchObject({
      recommendation: "chegou_certinho",
      actionGroup: "recover",
      quickConfirmAvailable: false,
    })
  })

  it("resume grupos e mantém recover antes de confirmação", () => {
    const rows = [
      { ...queueItem({ id: "c", actionGroup: "confirm_receipt", recommendation: "chegou_certinho", amount: 10, deadlineAt: "2026-11-01T00:00:00Z" }), claimCreatedAt: null },
      { ...queueItem({ id: "r", actionGroup: "recover", recommendation: "contestar", recoverableAmount: 90, amount: 90, deadlineAt: "2026-10-30T00:00:00Z" }), claimCreatedAt: null },
    ]
    expect(sortReviewQueue(rows).map((row) => row.id)).toEqual(["r", "c"])
    expect(summarizeQueueGroups(rows)).toMatchObject({
      recover: { count: 1, amount: 90, nextDeadlineAt: "2026-10-30T00:00:00Z" },
      confirmReceipt: { count: 1, nextDeadlineAt: "2026-11-01T00:00:00Z" },
    })
  })
})

describe("banner e selo por grupo", () => {
  const groups = {
    recover: { count: 2, amount: 190, nextDeadlineAt: "2026-10-30T03:00:00Z", nextDeadlineEstimated: false },
    confirmReceipt: { count: 3, nextDeadlineAt: "2026-11-01T03:00:00Z", nextDeadlineEstimated: false },
  }
  it("prioriza recuperação e mostra o secundário de confirmação", () => {
    expect(reviewBannerText({ groups })).toContain("2 casos pra recuperar")
    expect(reviewBannerText({ groups })).toContain("R$ 190,00")
    expect(reviewBannerSecondary({ groups })).toBe("+ 3 só pra confirmar recebimento")
    expect(recoveryBadgeCount(groups)).toBe(2)
  })
  it("usa confirmações quando não há casos de recuperação", () => {
    const onlyConfirm = { recover: { count: 0, amount: 0, nextDeadlineAt: null, nextDeadlineEstimated: false }, confirmReceipt: groups.confirmReceipt }
    expect(reviewBannerText({ groups: onlyConfirm })).toContain("3 devoluções só pra confirmar recebimento")
    expect(recoveryBadgeCount(onlyConfirm)).toBe(3)
  })
})

describe("validação pura da confirmação em lote", () => {
  it("exige permissão, confirmação e no máximo 20 ids", () => {
    expect(validateConfirmReceiptBatch({ selectedIds: ["a"], canManage: false, confirmed: "true" }).ok).toBe(false)
    expect(validateConfirmReceiptBatch({ selectedIds: ["a"], canManage: true, confirmed: "false" }).ok).toBe(false)
    expect(validateConfirmReceiptBatch({ selectedIds: Array.from({ length: 21 }, (_, index) => String(index)), canManage: true, confirmed: "true" }).ok).toBe(false)
    expect(validateConfirmReceiptBatch({ selectedIds: ["a", "a"], canManage: true, confirmed: "true" })).toEqual({ ok: true, ids: ["a"] })
  })

  it("marca a linha sem confirmação rápida como inelegível para ser pulada", () => {
    expect(isQuickConfirmBatchEligible({ quick_confirm_available: false })).toBe(false)
    expect(isQuickConfirmBatchEligible({ quick_confirm_available: true })).toBe(true)
  })
})

describe("contrato da tela do Recuperador", () => {
  it("monta resumo, fila, links e primeiro envio a partir de linhas fake", () => {
    const data = buildRecoveryScreenData({
      accountParam: "acc-1",
      reviewRows: [
        {
          id: "r-1",
          claim_id: 10,
          item_title: "Tênis",
          amount: 129.9,
          currency_id: "BRL",
          deadline_at: "2026-10-30T00:00:00Z",
          deadline_estimated: false,
          mode: "arrival",
          status_money: "refunded",
          claim_created_at: "2026-10-28T00:00:00Z",
        },
      ],
      reviewNow: { count: 1, amount: 129.9, nextDeadline: "2026-10-30T00:00:00Z", nextDeadlineEstimated: false },
      recovered: { count: 2, amount: 250 },
      hasFirstSubmission: true,
    })
    expect(data).toMatchObject({
      reviewNow: { count: 1, amount: 129.9, currencyId: "BRL", nextDeadlineAt: "2026-10-30T00:00:00Z", nextDeadlineEstimated: false },
      recovered: { count: 2, amount: 250 },
      groups: { recover: { count: 0, amount: 0 }, confirmReceipt: { count: 1 } },
      queue: [expect.objectContaining({ id: "r-1", claimId: 10, href: "/recuperador/devolucoes/r-1?conta=acc-1" })],
      hasFirstSubmission: true,
      xrayHref: "/recuperador?conta=acc-1&aba=raio-x",
      returnsHref: "/recuperador?conta=acc-1&aba=devolucoes&filtro=recuperar",
    })
  })
})
