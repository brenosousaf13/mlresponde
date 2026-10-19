import { describe, expect, it } from "vitest"

import {
  colorAlertStillValid,
  planAlertChanges,
  planEmails,
  reputationAlerts,
  shipmentAlerts,
  type AlertDraft,
  type ExistingAlert,
} from "@/lib/reputation/alerts"
import {
  buildForecast,
  claimsBackfillSince,
  mlRangeDate,
  nextDueAt,
  readAffects,
  sellerActions,
  toClaimRow,
  type MlClaim,
} from "@/lib/reputation/claims"
import { buildAlertEmail, reputationUrl } from "@/lib/reputation/email"
import {
  colorFromLevel,
  computeSlack,
  parsePeriodDays,
  readReputation,
  reputationRaw,
  reputationSignature,
  slackSentence,
  type MlSellerReputation,
} from "@/lib/reputation/metrics"
import { formatRate } from "@/lib/reputation/presentation"
import {
  classifyShipment,
  colorValue,
  nextShipmentCheck,
  readShipmentCosts,
  readSla,
  shipmentRisk,
} from "@/lib/reputation/shipments"
import { METRIC_LABELS } from "@/lib/reputation/thresholds"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function reputation(overrides: Partial<MlSellerReputation> & { sales?: number; period?: string } = {}): MlSellerReputation {
  const period = overrides.period ?? "60 days"
  return {
    level_id: "5_green",
    power_seller_status: null,
    metrics: {
      sales: { period, completed: overrides.sales ?? 244 },
      claims: { period, rate: 0, value: 0 },
      delayed_handling_time: { period, rate: 0, value: 0 },
      cancellations: { period, rate: 0, value: 0 },
    },
    ...overrides,
  }
}

describe("termômetro", () => {
  it("lê a cor do level_id e o período", () => {
    expect(colorFromLevel("5_green")).toBe("green")
    expect(colorFromLevel("4_light_green")).toBe("light_green")
    expect(colorFromLevel("3_yellow")).toBe("yellow")
    expect(colorFromLevel("1_red")).toBe("red")
    expect(colorFromLevel("red")).toBe("red")
    expect(colorFromLevel(null)).toBe("none")
    expect(colorFromLevel("qualquer")).toBe("none")
    expect(parsePeriodDays("60 days")).toBe(60)
    expect(parsePeriodDays("365 days")).toBe(365)
    expect(parsePeriodDays("historic")).toBeNull()
  })

  it("conta protegida usa os números reais (excluded)", () => {
    const reading = readReputation({
      level_id: "4_light_green",
      real_level: "red",
      protection_end_date: "2026-12-27T00:00:00.000-04:00",
      metrics: {
        sales: { period: "60 days", completed: 244 },
        claims: { period: "60 days", rate: 0, value: 0, excluded: { real_value: 24, real_rate: 0.0912 } },
        delayed_handling_time: { period: "60 days", rate: 0, value: 0, excluded: { real_value: 47, real_rate: 0.723 } },
        cancellations: { period: "60 days", rate: 0, value: 0, excluded: { real_value: 6, real_rate: 0.0228 } },
      },
    })
    expect(reading.protected).toBe(true)
    expect(reading.color).toBe("light_green")
    expect(reading.realColor).toBe("red")
    expect(reading.metrics.claims).toEqual({ value: 24, rate: 0.0912 })
    expect(computeSlack(reading).color).toBe("red")
  })

  it("guarda só o seller_reputation e muda a assinatura quando um número muda", () => {
    const raw = reputation()
    expect(Object.keys(reputationRaw(raw)).sort()).toEqual(
      ["level_id", "metrics", "power_seller_status", "protection_end_date", "real_level", "transactions"].sort()
    )
    const a = reputationSignature(readReputation(raw))
    const b = reputationSignature(
      readReputation(reputation({ metrics: { ...raw.metrics, claims: { period: "60 days", rate: 0.004, value: 1 } } }))
    )
    expect(a).not.toBe(b)
    expect(reputationSignature(readReputation(raw))).toBe(a)
  })

  it("verde com 244 vendas em 60 dias: folga de cada métrica", () => {
    const reading = readReputation(
      reputation({
        metrics: {
          sales: { period: "60 days", completed: 244 },
          claims: { period: "60 days", rate: 2 / 244, value: 2 },
          cancellations: { period: "60 days", rate: 0, value: 0 },
          delayed_handling_time: { period: "60 days", rate: 0, value: 0 },
        },
      })
    )
    const slack = computeSlack(reading)
    const [claims, cancellations, delayed] = slack.metrics
    expect(claims.base).toBe(244)
    expect(claims.slack).toBe(2) // floor(0,02 × 244 − 2) = floor(2,88)
    expect(claims.fallsTo).toBe("yellow")
    expect(cancellations.slack).toBe(3) // floor(0,015 × 244)
    expect(cancellations.approximate).toBe(false)
    expect(delayed.slack).toBe(24) // floor(0,10 × 244)
    expect(delayed.approximate).toBe(true)
    expect(slack.minSlack).toBe(2)
    expect(slack.computedBand).toBe("green")
    expect(slackSentence(claims, METRIC_LABELS.claims)).toBe("Você aguenta mais 2 reclamações antes de cair para amarelo.")
  })

  it("no limite: sem folga e mais 1 derruba a cor", () => {
    const reading = readReputation(
      reputation({
        sales: 50,
        metrics: {
          sales: { period: "60 days", completed: 50 },
          claims: { period: "60 days", rate: 0.02, value: 1 },
          cancellations: { period: "60 days", rate: 0, value: 0 },
          delayed_handling_time: { period: "60 days", rate: 0, value: 0 },
        },
      })
    )
    const claims = computeSlack(reading).metrics[0]
    expect(claims.slack).toBe(0)
    expect(slackSentence(claims, METRIC_LABELS.claims)).toBe("Sem folga: mais 1 reclamação e a cor cai para amarelo.")
  })

  it("365 dias usa os limites folgados de cancelamentos e atrasos", () => {
    const reading = readReputation(reputation({ period: "365 days", sales: 80 }))
    const [claims, cancellations, delayed] = computeSlack(reading).metrics
    expect(claims.slack).toBe(1) // 2% de 80 = 1,6
    expect(cancellations.slack).toBe(2) // 2,5% de 80
    expect(delayed.slack).toBe(10) // 13% de 80 = 10,4
  })

  it("a pior métrica define a cor calculada e o vermelho mostra quanto precisa sair", () => {
    const reading = readReputation(
      reputation({
        level_id: "1_red",
        metrics: {
          sales: { period: "60 days", completed: 100 },
          claims: { period: "60 days", rate: 0.1, value: 10 },
          cancellations: { period: "60 days", rate: 0.01, value: 1 },
          delayed_handling_time: { period: "60 days", rate: 0, value: 0 },
        },
      })
    )
    const slack = computeSlack(reading)
    expect(slack.computedBand).toBe("red")
    const claims = slack.metrics[0]
    expect(claims.slack).toBeNull()
    expect(claims.improvesTo).toBe("orange")
    expect(claims.toImprove).toBe(2) // laranja até 8% de 100 = 8
    expect(slack.metrics[1].toImprove).toBeNull()
  })

  it("sem cor (cinza): sem folga e quantas vendas faltam", () => {
    const reading = readReputation({
      level_id: null,
      metrics: { sales: { period: "365 days", completed: 3 }, cancellations: { period: "365 days", rate: 1, value: 1 } },
    })
    const slack = computeSlack(reading)
    expect(slack.gray).toBe(true)
    expect(slack.salesToStart).toBe(7)
    expect(slack.minSlack).toBeNull()
    expect(slack.metrics[1].base).toBe(1)
  })

  it("MercadoLíder: folga até perder a medalha", () => {
    const reading = readReputation(reputation({ power_seller_status: "platinum", sales: 1000 }))
    const claims = computeSlack(reading).metrics[0]
    expect(claims.leaderSlack).toBe(10) // 1% de 1000
    expect(computeSlack(readReputation(reputation())).metrics[0].leaderSlack).toBeNull()
  })

  it("percentual curto", () => {
    expect(formatRate(0.02)).toBe("2%")
    expect(formatRate(0.045)).toBe("4,5%")
    expect(formatRate(0.0912)).toBe("9,1%")
  })
})

describe("reclamações", () => {
  const claim: MlClaim = {
    id: 5204934310,
    resource_id: 2000008026430162,
    status: "opened",
    type: "mediations",
    stage: "claim",
    resource: "order",
    reason_id: "PDD9549",
    fulfilled: true,
    players: [
      { role: "complainant", type: "buyer", user_id: 111, available_actions: [] },
      {
        role: "respondent",
        type: "seller",
        user_id: 222,
        available_actions: [
          { action: "send_message_to_complainant", mandatory: true, due_date: "2026-10-21T22:43:59.000-04:00" },
          { action: "refund", mandatory: false, due_date: null },
          { action: "open_dispute", mandatory: true, due_date: "2026-10-20T10:00:00.000-03:00" },
        ],
      },
    ],
    date_created: "2026-10-18T09:59:05.000-04:00",
    last_updated: "2026-10-18T11:18:01.000-04:00",
  }

  it("ações do vendedor e o menor prazo obrigatório", () => {
    const actions = sellerActions(claim, 222)
    expect(actions.map((action) => action.action)).toEqual(["send_message_to_complainant", "refund", "open_dispute"])
    expect(nextDueAt(actions)).toBe("2026-10-20T13:00:00.000Z")
  })

  it("vira linha com os campos da busca", () => {
    const row = toClaimRow(claim, 222)
    expect(row).toMatchObject({
      claim_id: 5204934310,
      resource: "order",
      resource_id: 2000008026430162,
      type: "mediations",
      status: "opened",
      next_due_at: "2026-10-20T13:00:00.000Z",
      ml_created_at: "2026-10-18T13:59:05.000Z",
    })
    expect(toClaimRow({ ...claim, status: "closed" }, 222)?.next_due_at).toBeNull()
    expect(toClaimRow({ ...claim, id: "abc" }, 222)).toBeNull()
  })

  it("data da busca com milissegundos e o início da busca inicial", () => {
    const now = new Date("2026-10-19T12:00:00.000Z")
    expect(mlRangeDate(now)).toBe("2026-10-19T12:00:00.000+00:00")
    expect(claimsBackfillSince(60, now).toISOString()).toBe("2026-07-21T12:00:00.000Z") // 60 + 30 dias
    expect(claimsBackfillSince(null, now).toISOString()).toBe("2025-09-19T12:00:00.000Z")
  })

  it("lê o affects-reputation", () => {
    expect(readAffects({ affects_reputation: "affected", has_incentive: true, due_date: null })).toEqual({
      affects: "affected",
      hasIncentive: true,
      dueAt: null,
    })
    expect(readAffects({ affects_reputation: "outra coisa" }).affects).toBeNull()
  })

  it("previsão: só as que contam e ainda estão no período, agrupadas pelo dia de saída", () => {
    const now = new Date("2026-10-19T12:00:00.000Z")
    const forecast = buildForecast(
      [
        { claim_id: 1, sale_at: "2026-09-01T15:00:00.000Z", affects_reputation: "affected" }, // sai 31/10
        { claim_id: 2, sale_at: "2026-09-01T16:00:00.000Z", affects_reputation: "affected" }, // mesmo dia
        { claim_id: 3, sale_at: "2026-09-20T12:00:00.000Z", affects_reputation: "affected" }, // sai 19/11
        { claim_id: 4, sale_at: "2026-09-10T12:00:00.000Z", affects_reputation: "not_affected" },
        { claim_id: 5, sale_at: "2026-07-01T12:00:00.000Z", affects_reputation: "affected" }, // já saiu
        { claim_id: 6, sale_at: null, affects_reputation: "affected" },
      ],
      60,
      now
    )
    expect(forecast.counted).toBe(3)
    expect(forecast.entries.map((entry) => [entry.day, entry.claims, entry.remaining])).toEqual([
      ["2026-10-31", [1, 2], 1],
      ["2026-11-19", [3], 0],
    ])
  })
})

describe("despachos", () => {
  const now = new Date("2026-10-19T15:00:00.000Z") // 12:00 em São Paulo

  it("classifica pela situação e logística (Full e cancelado ficam de fora)", () => {
    expect(classifyShipment({ status: "ready_to_ship", substatus: "printed", logistic: { type: "drop_off" } }).stage).toBe("waiting")
    expect(classifyShipment({ status: "handling", logistic: { type: "fulfillment" } }).stage).toBe("fulfillment")
    expect(classifyShipment({ status: "cancelled", logistic: { type: "drop_off" } }).stage).toBe("cancelled")
    expect(classifyShipment({ status: "shipped", logistic: { type: "self_service" } }).stage).toBe("shipped")
    expect(classifyShipment({ status: "delivered", logistic_type: "cross_docking" })).toMatchObject({
      stage: "shipped",
      logisticType: "cross_docking",
    })
  })

  it("risco pelo prazo: atrasado, vence logo (4 h ou hoje), no prazo e sem prazo", () => {
    expect(shipmentRisk("2026-10-19T14:00:00.000Z", now)).toBe("late")
    expect(shipmentRisk("2026-10-19T18:00:00.000Z", now)).toBe("at_risk")
    expect(shipmentRisk("2026-10-20T02:00:00.000Z", now)).toBe("at_risk") // 23:00 em São Paulo, ainda hoje
    expect(shipmentRisk("2026-10-20T14:00:00.000Z", now)).toBe("on_time")
    expect(shipmentRisk(null, now)).toBe("no_deadline")
    expect(readSla({ status: "on_time", service: null, expected_date: "2024-05-22T23:59:59-03:00" }).expectedAt).toBe(
      "2024-05-23T02:59:59.000Z"
    )
    expect(readSla(null).expectedAt).toBeNull()
  })

  it("próxima conferência: 10 min perto do prazo, 30 min no prazo, nunca depois de despachado", () => {
    expect(nextShipmentCheck("waiting", "at_risk", now)?.getTime()).toBe(now.getTime() + 10 * 60 * 1000)
    expect(nextShipmentCheck("waiting", "late", now)?.getTime()).toBe(now.getTime() + 10 * 60 * 1000)
    expect(nextShipmentCheck("waiting", "on_time", now)?.getTime()).toBe(now.getTime() + 30 * 60 * 1000)
    expect(nextShipmentCheck("shipped", "on_time", now)).toBeNull()
    expect(nextShipmentCheck("fulfillment", "on_time", now)).toBeNull()
  })

  it("desconto do frete do vendedor", () => {
    const costs = {
      gross_amount: 24.55,
      senders: [{ user_id: 81387353, cost: 8.19, discounts: [{ rate: 0.6, type: "mandatory", promoted_amount: 12.29 }] }],
    }
    expect(readShipmentCosts(costs, 81387353)).toEqual({ senderCost: 8.19, senderDiscount: 12.29, grossAmount: 24.55 })
    expect(readShipmentCosts({ senders: [{ user_id: 1, cost: 0, discounts: [] }] }, 1).senderDiscount).toBe(0)
    expect(readShipmentCosts(null, 1)).toEqual({ senderCost: null, senderDiscount: 0, grossAmount: null })
  })

  it("valor da cor nos últimos 30 dias (projetado quando há menos dados)", () => {
    const value = colorValue(
      [
        { ordered_at: new Date(now.getTime() - 5 * DAY).toISOString(), sender_discount: 10, sender_cost: 8 },
        { ordered_at: new Date(now.getTime() - 2 * DAY).toISOString(), sender_discount: 5, sender_cost: 4 },
        { ordered_at: new Date(now.getTime() - 40 * DAY).toISOString(), sender_discount: 100, sender_cost: 1 },
      ],
      now
    )
    expect(value.shipments).toBe(2)
    expect(value.discount).toBe(15)
    expect(value.coveredDays).toBe(5)
    expect(value.monthlyEstimate).toBe(90)
    expect(colorValue([], now)).toMatchObject({ shipments: 0, discount: 0, since: null })
  })
})

describe("alertas", () => {
  const now = new Date("2026-10-19T15:00:00.000Z")

  function existing(overrides: Partial<ExistingAlert>): ExistingAlert {
    return {
      id: "a1",
      kind: "shipment_late",
      dedupe_key: "shipment_late:1",
      status: "open",
      opened_at: now.toISOString(),
      resolved_at: null,
      expires_at: null,
      email_status: "sent",
      data: {},
      ...overrides,
    }
  }

  it("folga de 1 ou menos vira alerta; cinza não", () => {
    const tight = computeSlack(
      readReputation(
        reputation({
          sales: 50,
          metrics: {
            sales: { period: "60 days", completed: 50 },
            claims: { period: "60 days", rate: 0.02, value: 1 },
            cancellations: { period: "60 days", rate: 0, value: 0 },
            delayed_handling_time: { period: "60 days", rate: 0, value: 0 },
          },
        })
      )
    )
    const drafts = reputationAlerts({ previousColor: "green", color: "green", slack: tight, periodDays: 60, now })
    expect(drafts.map((draft) => draft.key)).toEqual(["margin_low:claims:green", "margin_low:cancellations:green"])
    const gray = computeSlack(readReputation({ level_id: null, metrics: { sales: { completed: 2 } } }))
    expect(reputationAlerts({ previousColor: null, color: "none", slack: gray, periodDays: 365, now })).toEqual([])
  })

  it("cor caiu e cor voltou", () => {
    const slack = computeSlack(readReputation(reputation({ sales: 1000 })))
    const dropped = reputationAlerts({ previousColor: "green", color: "yellow", slack, periodDays: 60, now })
    expect(dropped[0]).toMatchObject({ kind: "color_dropped", key: "color_dropped:green:yellow:2026-10-19" })
    const recovered = reputationAlerts({ previousColor: "yellow", color: "green", slack, periodDays: 60, now })
    expect(recovered[0]).toMatchObject({ kind: "color_recovered" })
    expect(recovered[0].expiresAt).toBe("2026-10-22T15:00:00.000Z")
    expect(reputationAlerts({ previousColor: "none", color: "green", slack, periodDays: 60, now })).toEqual([])
  })

  it("'cor caiu' continua aberto até voltar ao nível de antes", () => {
    const alert = existing({ kind: "color_dropped", data: { fromRank: 5 } })
    expect(colorAlertStillValid(alert, "yellow")).toBe(true)
    expect(colorAlertStillValid(alert, "green")).toBe(false)
  })

  it("envios atrasados e perto do prazo", () => {
    const drafts = shipmentAlerts(
      [
        { shipment_id: 1, sla_expected_at: "2026-10-19T14:00:00.000Z", item_title: "Calça", ml_order_id: 10, pack_id: null },
        { shipment_id: 2, sla_expected_at: "2026-10-19T17:00:00.000Z", item_title: null, ml_order_id: 20, pack_id: null },
        { shipment_id: 3, sla_expected_at: "2026-10-21T17:00:00.000Z", item_title: "Saia", ml_order_id: 30, pack_id: null },
      ],
      now
    )
    expect(drafts.map((draft) => [draft.kind, draft.key])).toEqual([
      ["shipment_late", "shipment_late:1"],
      ["shipment_at_risk", "shipment_at_risk:2"],
    ])
    expect(drafts[1].title).toContain("Venda 20")
  })

  it("abre, atualiza, reabre (com e sem e-mail) e resolve sem repetir", () => {
    const draft = (key: string): AlertDraft => ({ kind: "shipment_late", key, title: "t", body: "b", data: {} })
    const plan = planAlertChanges({
      existing: [
        existing({ id: "open", dedupe_key: "k-open" }),
        existing({ id: "old", dedupe_key: "k-old", status: "resolved", resolved_at: new Date(now.getTime() - 8 * DAY).toISOString() }),
        existing({ id: "recent", dedupe_key: "k-recent", status: "resolved", resolved_at: new Date(now.getTime() - DAY).toISOString() }),
        existing({ id: "gone", dedupe_key: "k-gone", email_status: "pending" }),
        existing({ id: "other-kind", kind: "margin_low", dedupe_key: "k-margin" }),
      ],
      drafts: [draft("k-open"), draft("k-old"), draft("k-recent"), draft("k-new"), draft("k-new")],
      scope: ["shipment_late", "shipment_at_risk"],
      now,
    })
    expect(plan.inserts.map((item) => item.key)).toEqual(["k-new"])
    expect(plan.refresh.map((item) => item.id)).toEqual(["open"])
    expect(plan.reopenLoud.map((item) => item.id)).toEqual(["old"])
    expect(plan.reopenSilent.map((item) => item.id)).toEqual(["recent"])
    expect(plan.resolve).toEqual([{ id: "gone", skipEmail: true }])
  })

  it("alerta com validade vive até expirar; 'cor caiu' segue enquanto stillValid", () => {
    const plan = planAlertChanges({
      existing: [
        existing({ id: "rec", kind: "color_recovered", dedupe_key: "r", expires_at: new Date(now.getTime() + HOUR).toISOString() }),
        existing({ id: "rec-old", kind: "color_recovered", dedupe_key: "r2", expires_at: new Date(now.getTime() - HOUR).toISOString() }),
        existing({ id: "drop", kind: "color_dropped", dedupe_key: "d", data: { fromRank: 5 } }),
        existing({ id: "margin", kind: "margin_low", dedupe_key: "m" }),
      ],
      drafts: [],
      scope: ["margin_low", "color_dropped", "color_recovered"],
      stillValid: (alert) => colorAlertStillValid(alert, "yellow"),
      now,
    })
    expect(plan.resolve.map((item) => item.id).sort()).toEqual(["margin", "rec-old"])
  })

  it("e-mails: 1 por conta e tipo, a cada 30 min, sem alerta velho, resolvido ou informativo", () => {
    const alert = (id: string, overrides: Record<string, string> = {}) => ({
      id,
      organization_id: "org",
      ml_account_id: "acc",
      kind: "shipment_late",
      status: "open",
      created_at: now.toISOString(),
      opened_at: now.toISOString(),
      ...overrides,
    })
    const plan = planEmails(
      [
        alert("1"),
        alert("2"),
        alert("3", { kind: "shipment_at_risk" }),
        alert("4", { status: "resolved" }),
        alert("5", { opened_at: new Date(now.getTime() - 7 * HOUR).toISOString() }),
        alert("6", { kind: "color_recovered" }),
        alert("7", { ml_account_id: "acc2", kind: "margin_low" }),
      ],
      new Map([["acc2:margin_low", new Date(now.getTime() - 10 * 60 * 1000).toISOString()]]),
      now
    )
    expect(plan.groups).toEqual([
      { organizationId: "org", accountId: "acc", kind: "shipment_late", ids: ["1", "2"] },
      { organizationId: "org", accountId: "acc", kind: "shipment_at_risk", ids: ["3"] },
    ])
    expect(plan.skip.sort()).toEqual(["4", "5", "6"])
  })

  it("texto do e-mail com o link da conta e sem HTML do vendedor", () => {
    const email = buildAlertEmail({
      kind: "shipment_late",
      accountName: "LOJA <X>",
      storeName: "Minha loja",
      items: [
        { title: "Envio atrasado: Calça", body: "Prazo era ontem." },
        { title: "Envio atrasado: Saia", body: "Prazo era hoje." },
      ],
      url: reputationUrl("https://app.maanu.com.br/", "abc"),
    })
    expect(email.subject).toBe("2 envios atrasados na LOJA <X> · maanu")
    expect(email.html).toContain("LOJA &lt;X&gt;")
    expect(email.html).not.toContain("LOJA <X>")
    expect(email.html).toContain("https://app.maanu.com.br/reputacao?conta=abc")
    expect(email.text).toContain("• Envio atrasado: Saia")
    expect(email.text).toContain("Abrir na maanu: https://app.maanu.com.br/reputacao?conta=abc")
  })
})
