import { dayKey } from "@/lib/format"

/**
 * Envios das vendas → prazo de despacho, risco e desconto do frete (puro, testado em tests/unit/reputation.test.ts).
 * Do envio só saem situação, logística e datas: endereço e telefone do comprador nunca são lidos daqui.
 */

export type ShipmentStage = "pending" | "waiting" | "shipped" | "fulfillment" | "cancelled"

/** /shipments/{id} com x-format-new: true (só os campos usados). */
export type MlShipmentInfo = {
  status?: string | null
  substatus?: string | null
  logistic?: { mode?: string | null; type?: string | null } | null
  /** Formato antigo. */
  logistic_type?: string | null
}

export type MlShipmentSla = {
  status?: string | null
  service?: string | null
  expected_date?: string | null
}

export type MlShipmentCosts = {
  gross_amount?: number | null
  senders?: {
    user_id?: number | string | null
    cost?: number | null
    discounts?: { rate?: number | null; type?: string | null; promoted_amount?: number | null }[] | null
  }[] | null
}

const SHIPPED_STATUSES = new Set(["shipped", "delivered", "not_delivered"])

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

export function classifyShipment(info: MlShipmentInfo): {
  stage: Exclude<ShipmentStage, "pending">
  status: string | null
  substatus: string | null
  logisticType: string | null
} {
  const status = text(info.status, 40)
  const substatus = text(info.substatus, 60)
  const logisticType = text(info.logistic?.type ?? info.logistic_type, 40)
  let stage: Exclude<ShipmentStage, "pending"> = "waiting"
  if (status === "cancelled") stage = "cancelled"
  else if (logisticType === "fulfillment") stage = "fulfillment"
  else if (status && SHIPPED_STATUSES.has(status)) stage = "shipped"
  return { stage, status, substatus, logisticType }
}

export function readSla(sla: MlShipmentSla | null): { status: string | null; service: string | null; expectedAt: string | null } {
  const time = typeof sla?.expected_date === "string" ? Date.parse(sla.expected_date) : NaN
  return {
    status: text(sla?.status, 40),
    service: text(sla?.service, 40),
    expectedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
  }
}

export type ShipmentRisk = "late" | "at_risk" | "on_time" | "no_deadline"

/** "Em risco": vence em até 4 horas ou ainda hoje (fuso de São Paulo). */
export const AT_RISK_WINDOW_MS = 4 * 60 * 60 * 1000

/** Risco calculado na hora pelo prazo (não precisa chamar o ML para o relógio andar). */
export function shipmentRisk(expectedAt: string | null, now: Date = new Date()): ShipmentRisk {
  if (!expectedAt) return "no_deadline"
  const deadline = Date.parse(expectedAt)
  if (!Number.isFinite(deadline)) return "no_deadline"
  if (now.getTime() > deadline) return "late"
  if (deadline - now.getTime() <= AT_RISK_WINDOW_MS || dayKey(new Date(deadline)) === dayKey(now)) return "at_risk"
  return "on_time"
}

const MINUTE = 60 * 1000

/** Próxima conferência no ML: a cada 10 min perto do prazo, a cada 30 min no prazo; despachado/Full/cancelado não volta. */
export function nextShipmentCheck(stage: ShipmentStage, risk: ShipmentRisk, now: Date = new Date()): Date | null {
  if (stage === "pending") return new Date(now.getTime() + 10 * MINUTE)
  if (stage !== "waiting") return null
  const minutes = risk === "on_time" || risk === "no_deadline" ? 30 : 10
  return new Date(now.getTime() + minutes * MINUTE)
}

/** Custo e desconto do frete do vendedor (soma dos descontos do sender). */
export function readShipmentCosts(costs: MlShipmentCosts | null, sellerId: number): {
  senderCost: number | null
  senderDiscount: number
  grossAmount: number | null
} {
  const senders = costs?.senders ?? []
  const sender = senders.find((item) => Number(item.user_id) === sellerId) ?? (senders.length === 1 ? senders[0] : null)
  const discount = (sender?.discounts ?? []).reduce((sum, item) => {
    const amount = Number(item?.promoted_amount)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  const cost = Number(sender?.cost)
  const gross = Number(costs?.gross_amount)
  return {
    senderCost: sender && Number.isFinite(cost) ? round2(cost) : null,
    senderDiscount: round2(discount),
    grossAmount: Number.isFinite(gross) ? round2(gross) : null,
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

const DAY_MS = 24 * 60 * 60 * 1000

export type ColorValueRow = { ordered_at: string | null; sender_discount: number | null; sender_cost: number | null }

/**
 * Quanto a cor vale nos últimos 30 dias: soma dos descontos do frete dos envios conferidos. A tabela laranja/vermelha não
 * tem desconto, então "no laranja/vermelho você pagaria até" = os descontos do mês (estimativa; com menos de 30 dias de
 * dados, projetado para 30).
 */
export function colorValue(rows: readonly ColorValueRow[], now: Date = new Date()): {
  shipments: number
  discount: number
  cost: number
  since: string | null
  coveredDays: number
  monthlyEstimate: number
} {
  const from = now.getTime() - 30 * DAY_MS
  const inWindow = rows.filter((row) => row.ordered_at && Date.parse(row.ordered_at) >= from)
  const discount = round2(inWindow.reduce((sum, row) => sum + Math.max(0, Number(row.sender_discount) || 0), 0))
  const cost = round2(inWindow.reduce((sum, row) => sum + Math.max(0, Number(row.sender_cost) || 0), 0))
  const oldest = inWindow.reduce<number | null>((min, row) => {
    const time = Date.parse(row.ordered_at as string)
    return min === null || time < min ? time : min
  }, null)
  const coveredDays = oldest === null ? 0 : Math.min(30, Math.max(1, Math.ceil((now.getTime() - oldest) / DAY_MS)))
  return {
    shipments: inWindow.length,
    discount,
    cost,
    since: oldest === null ? null : new Date(oldest).toISOString(),
    coveredDays,
    monthlyEstimate: coveredDays >= 3 ? round2((discount / coveredDays) * 30) : discount,
  }
}

