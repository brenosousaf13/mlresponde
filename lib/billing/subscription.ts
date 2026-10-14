/**
 * Regras da assinatura vistas pelo app (puro, testado em tests/unit/abacatepay.test.ts): o que acontece quando o
 * cliente escolhe um plano, e os textos da tela Assinatura.
 */

import { sellablePlan, type BillingCycle } from "@/lib/plans/plans"

export type CurrentSubscription = {
  plan: string
  cycle: BillingCycle
  status: "active" | "cancelled"
  /** A última cobrança foi recusada (a AbacatePay está tentando de novo). */
  paymentFailing: boolean
  scheduledPlan: string | null
}

/**
 *  - subscribe: não tem assinatura ativa → página de pagamento;
 *  - change_plan: mesma forma de pagamento (mensal/anual), outro plano → troca na própria assinatura;
 *  - replace: outra forma de pagamento, ou cobrança recusada (pagar com outro cartão) → assinatura nova; quando ela é
 *    paga, a anterior é cancelada;
 *  - current: é o plano atual.
 */
export type PlanIntent = "subscribe" | "change_plan" | "replace" | "current"

export function planIntent(current: CurrentSubscription | null, plan: string, cycle: BillingCycle): PlanIntent {
  if (!current || current.status !== "active") return "subscribe"
  if (current.paymentFailing) return "replace"
  if (current.cycle !== cycle) return "replace"
  return current.plan === plan ? "current" : "change_plan"
}

/** Subir de plano (mais caro no mesmo ciclo) libera na hora; descer vale a partir da próxima cobrança. */
export function isUpgrade(fromPlan: string, toPlan: string, cycle: BillingCycle): boolean {
  const from = sellablePlan(fromPlan)
  const to = sellablePlan(toPlan)
  if (!from || !to) return false
  const price = (plan: typeof from) => (cycle === "annual" ? plan.priceAnnual : plan.priceMonthly)
  return price(to) > price(from)
}

const CANCEL_REASONS: Record<string, string> = {
  max_payment_retries_exceeded: "as tentativas de cobrança no cartão não deram certo",
  dispute_opened: "foi aberta uma contestação no cartão",
}

export function cancelReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null
  return CANCEL_REASONS[reason] ?? null
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = { CARD: "Cartão de crédito", PIX: "PIX Automático" }