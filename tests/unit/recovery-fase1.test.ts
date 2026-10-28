import { afterEach, describe, expect, it, vi } from "vitest"

import { returnAlerts } from "@/lib/recovery/alerts"
import { reviewBannerText } from "@/lib/recovery/banner"
import { formatRecoveryLog, logRecovery, shortAccount } from "@/lib/recovery/log"
import {
  ARRIVAL_WINDOW_DAYS,
  arrivalDate,
  classifyReturn,
  deadlinePassed,
  parseReturn,
  returnPhase,
  reviewDeadline,
  type ReturnReview,
} from "@/lib/recovery/returns"
import { classifySyncHealth, organizationHasAccess } from "@/lib/recovery/sync-health"

const NOW = new Date("2026-10-28T12:00:00.000Z")
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function review(overrides: Partial<ReturnReview> = {}): ReturnReview {
  return {
    order_id: 1,
    method: "triage",
    stage: "seller_review_pending",
    status: "closed",
    product_condition: "unsaleable",
    product_destination: "discard",
    reason_id: "SRF3",
    benefited: "buyer",
    seller_status: "pending",
    seller_reason: null,
    updated_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  }
}

const parsed = parseReturn({
  id: 1,
  status: "delivered",
  shipments: [{ status: "delivered", type: "return", destination: { name: "seller_address" } }],
  orders: [{ order_id: 1 }],
})

describe("devoluções vencidas saem da fila", () => {
  const base = { claimStatus: "opened", parsed, mode: "arrival" as const, reviews: [], reviewSubmitted: false }

  it("prazo passado: sai de needs_review e vai para o histórico (closed)", () => {
    const past = new Date(NOW.getTime() - HOUR).toISOString()
    expect(returnPhase({ ...base, deadlineAt: past, now: NOW })).toBe("closed")
    expect(returnPhase({ ...base, claimStatus: "closed", deadlineAt: past, now: NOW })).toBe("closed")
  })

  it("prazo futuro, sem prazo ou sem informar a hora continuam acionáveis", () => {
    expect(returnPhase({ ...base, deadlineAt: new Date(NOW.getTime() + HOUR).toISOString(), now: NOW })).toBe("needs_review")
    expect(returnPhase({ ...base, deadlineAt: null, now: NOW })).toBe("needs_review")
    expect(returnPhase(base)).toBe("needs_review")
  })

  it("prazo estimado vencido também sai", () => {
    const arrived = new Date(NOW.getTime() - 4 * DAY).toISOString()
    const deadline = reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: null, reviews: [], arrivedAt: arrived })
    expect(deadline.estimated).toBe(true)
    expect(deadlinePassed(deadline.at, NOW)).toBe(true)
    expect(returnPhase({ ...base, deadlineAt: deadline.at, now: NOW })).toBe("closed")
  })

  it("deadlinePassed: sem prazo ou data inválida não vence", () => {
    expect(deadlinePassed(null, NOW)).toBe(false)
    expect(deadlinePassed("lixo", NOW)).toBe(false)
    expect(deadlinePassed(NOW.toISOString(), NOW)).toBe(true)
  })

  it("contestação vencida fecha o achado como expired (não fica contestável)", () => {
    const input = {
      claimId: 9,
      claimStatus: "closed",
      resolution: null,
      reviews: [review()],
      mode: "appeal" as const,
      deadlineAt: new Date(NOW.getTime() - DAY).toISOString(),
      amount: 100,
      currencyId: "BRL",
      orderId: 1,
      itemTitle: "Tênis",
      statusMoney: "refunded",
    }
    expect(classifyReturn(input)?.outcome).toBe("contestable")
    expect(classifyReturn({ ...input, overdue: true })).toMatchObject({ outcome: "expired", status: "resolved" })
  })

  it("alerta não nasce para devolução vencida (nem de revisão nem de prazo vencendo)", () => {
    const row = { id: "r", claim_id: 7, phase: "needs_review", mode: "arrival" as const, item_title: "Tênis", recovered_at: null, recovered_amount: null }
    expect(returnAlerts([{ ...row, deadline_at: new Date(NOW.getTime() - HOUR).toISOString() }], NOW)).toEqual([])
    expect(returnAlerts([{ ...row, deadline_at: new Date(NOW.getTime() + 2 * HOUR).toISOString() }], NOW)).toHaveLength(1)
    expect(returnAlerts([{ ...row, deadline_at: null }], NOW)).toHaveLength(1)
  })
})

describe("prazo padrão de 3 dias no modo arrival", () => {
  const arrived = "2026-10-26T09:00:00.000Z"

  it("sem prazo do ML: chegada + 3 dias, estimado", () => {
    expect(ARRIVAL_WINDOW_DAYS).toBe(3)
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: null, reviews: [], arrivedAt: arrived })).toEqual({
      at: "2026-10-29T09:00:00.000Z",
      estimated: true,
    })
  })

  it("prazo real do ML vence a estimativa", () => {
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: { due_date: "2026-10-30T02:00:00.000Z" }, reviews: [], arrivedAt: arrived })).toEqual({
      at: "2026-10-30T02:00:00.000Z",
      estimated: false,
    })
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: "2026-11-01T00:00:00.000Z", detail: null, reviews: [], arrivedAt: arrived })).toEqual({
      at: "2026-11-01T00:00:00.000Z",
      estimated: false,
    })
    expect(reviewDeadline({ mode: "arrival", actionDue: "2026-10-27T00:00:00.000Z", nextDueAt: null, detail: null, reviews: [], arrivedAt: arrived })).toEqual({
      at: "2026-10-27T00:00:00.000Z",
      estimated: false,
    })
  })

  it("sem nenhuma data de chegada mantém null", () => {
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: null, reviews: [] })).toEqual({ at: null, estimated: false })
    expect(reviewDeadline({ mode: "arrival", actionDue: null, nextDueAt: null, detail: null, reviews: [], arrivedAt: "lixo" })).toEqual({ at: null, estimated: false })
  })

  it("a contestação continua com os 60 dias estimados", () => {
    const deadline = reviewDeadline({ mode: "appeal", actionDue: null, nextDueAt: null, detail: null, reviews: [review()] })
    expect(deadline.estimated).toBe(true)
    expect(deadline.at).toBe("2026-11-30T10:00:00.000Z")
  })

  it("melhor data de chegada: a do envio, senão a revisão mais recente, senão nada", () => {
    const withDate = parseReturn({ id: 1, status: "delivered", shipments: [{ type: "return", status: "delivered", date_delivered: "2026-10-25T12:00:00Z" }] })
    expect(arrivalDate(withDate, [review({ updated_at: "2026-10-26T00:00:00.000Z" })])).toBe("2026-10-25T12:00:00.000Z")
    expect(arrivalDate(parsed, [review({ updated_at: "2026-10-20T00:00:00.000Z" }), review({ updated_at: "2026-10-26T00:00:00.000Z" })])).toBe(
      "2026-10-26T00:00:00.000Z"
    )
    expect(arrivalDate(parsed, [])).toBeNull()
  })
})

describe("saúde da leitura do Recuperador", () => {
  const fresh = { last_returns_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(), last_error: null, last_error_at: null }
  const base = { now: NOW, accountActive: true, tokenValid: true, hasAccess: true, sync: fresh }

  it("ok: leitura recente, ainda sem primeira leitura ou erro recente (a rodada tenta de novo)", () => {
    expect(classifySyncHealth(base).status).toBe("ok")
    expect(classifySyncHealth({ ...base, sync: null }).status).toBe("ok")
    expect(classifySyncHealth({ ...base, sync: { last_returns_at: null, last_error: null, last_error_at: null } }).status).toBe("ok")
    const recentError = { last_returns_at: fresh.last_returns_at, last_error: "timeout", last_error_at: fresh.last_returns_at }
    expect(classifySyncHealth({ ...base, sync: recentError }).status).toBe("ok")
  })

  it("parado: mais de 30 minutos sem leitura, com o último erro real na mensagem", () => {
    const old = new Date(NOW.getTime() - 45 * 60_000).toISOString()
    const stalled = classifySyncHealth({ ...base, sync: { last_returns_at: old, last_error: null, last_error_at: null } })
    expect(stalled.status).toBe("parado")
    expect(stalled.message).toContain("45 minutos")
    const withError = classifySyncHealth({ ...base, sync: { last_returns_at: old, last_error: "ML fora do ar", last_error_at: old } })
    expect(withError).toMatchObject({ status: "parado", reason: "ML fora do ar" })
    expect(withError.message).toContain("ML fora do ar")
    expect(classifySyncHealth({ ...base, sync: { last_returns_at: new Date(NOW.getTime() - 29 * 60_000).toISOString(), last_error: null, last_error_at: null } }).status).toBe("ok")
  })

  it("sem_acesso: teste vencido explica a data", () => {
    const result = classifySyncHealth({ ...base, hasAccess: false, trialEndsAt: "2026-10-20T15:00:00.000Z" })
    expect(result.status).toBe("sem_acesso")
    expect(result.message).toContain("Seu teste grátis terminou em 20/10")
    expect(classifySyncHealth({ ...base, hasAccess: false, trialEndsAt: "2027-01-01T00:00:00.000Z" }).message).toContain("sem assinatura ativa")
  })

  it("token_invalido: conta desconectada ou token ruim vence os outros motivos", () => {
    expect(classifySyncHealth({ ...base, tokenValid: false, hasAccess: false }).status).toBe("token_invalido")
    expect(classifySyncHealth({ ...base, accountActive: false }).status).toBe("token_invalido")
  })

  it("organizationHasAccess espelha o claim_recovery_sync", () => {
    const future = "2026-11-10T00:00:00.000Z"
    const past = "2026-10-20T00:00:00.000Z"
    expect(organizationHasAccess({ billing_exempt: true }, NOW)).toBe(true)
    expect(organizationHasAccess({ subscription_status: "active" }, NOW)).toBe(true)
    expect(organizationHasAccess({ subscription_status: "past_due", current_period_end: future }, NOW)).toBe(true)
    expect(organizationHasAccess({ subscription_status: "canceled", current_period_end: past }, NOW)).toBe(false)
    expect(organizationHasAccess({ subscription_status: "trialing", trial_ends_at: future }, NOW)).toBe(true)
    expect(organizationHasAccess({ subscription_status: "trialing", trial_ends_at: past }, NOW)).toBe(false)
    expect(organizationHasAccess({ subscription_status: null }, NOW)).toBe(false)
  })
})

describe("log estruturado do Recuperador", () => {
  afterEach(() => vi.restoreAllMocks())

  it("uma linha com o prefixo e JSON no formato combinado, conta só com os 4 últimos", () => {
    const line = formatRecoveryLog({ etapa: "elegivel", conta: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeee1234", claim_id: 123, resultado: "ok", detalhe: "modo=arrival" })
    expect(line.startsWith("[recuperador] ")).toBe(true)
    expect(line).not.toContain("\n")
    expect(JSON.parse(line.slice("[recuperador] ".length))).toEqual({ etapa: "elegivel", conta: "1234", claim_id: 123, resultado: "ok", detalhe: "modo=arrival" })
    expect(shortAccount("abcdef")).toBe("cdef")
  })

  it("descarta campos fora do formato (dados de comprador) e limpa e-mails do detalhe", () => {
    const entry = {
      etapa: "lido",
      conta: "conta-9999",
      claim_id: 5,
      resultado: "falha",
      detalhe: "erro de joao@exemplo.com.br " + "x".repeat(400),
      buyer_nickname: "COMPRADOR_FULANO",
      buyer_name: "Fulano de Tal",
      address: "Rua das Flores 10",
      reason_detail: "texto da reclamação",
    } as never
    const line = formatRecoveryLog(entry)
    const parsedLine = JSON.parse(line.slice("[recuperador] ".length))
    expect(Object.keys(parsedLine).sort()).toEqual(["claim_id", "conta", "detalhe", "etapa", "resultado"])
    for (const secret of ["COMPRADOR_FULANO", "Fulano", "Rua das Flores", "texto da reclamação", "joao@exemplo"]) expect(line).not.toContain(secret)
    expect(parsedLine.detalhe.length).toBeLessThanOrEqual(200)
  })

  it("logRecovery: ok vai para console.log e falha para console.error, sem lançar erro", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    logRecovery({ etapa: "avisado", conta: "x1234", claim_id: 1, resultado: "ok" })
    logRecovery({ etapa: "enviado", conta: "x1234", claim_id: 1, resultado: "falha", detalhe: "ml_status=500" })
    logRecovery({ etapa: "sem_acesso", conta: "x1234", resultado: "pulado" })
    expect(log).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain('"etapa":"enviado"')
  })
})

describe("texto do aviso no topo do Recuperador", () => {
  it("esconde quando não há devolução", () => {
    expect(reviewBannerText({ count: 0, amount: 0, nextDeadline: null })).toBeNull()
  })

  it("singular e plural, valor em R$ e data da primeira que vence", () => {
    const one = reviewBannerText({ count: 1, amount: 129.9, nextDeadline: "2026-10-30T15:00:00.000Z" })?.replace(/\u00a0/g, " ")
    expect(one).toBe("1 devolução pra revisar · R$ 129,90 · vence em 30/10")
    const many = reviewBannerText({ count: 3, amount: 1250.5, nextDeadline: "2026-10-30T15:00:00.000Z" })?.replace(/\u00a0/g, " ")
    expect(many).toBe("3 devoluções pra revisar · R$ 1.250,50 · a primeira vence em 30/10")
  })

  it("omite o valor e o prazo quando não existem", () => {
    expect(reviewBannerText({ count: 2, amount: 0, nextDeadline: null })).toBe("2 devoluções pra revisar")
  })
})
