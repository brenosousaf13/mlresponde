/**
 * O que fazer com cada evento de assinatura da AbacatePay (puro, testado em tests/unit/abacatepay.test.ts).
 * Quem chama (lib/billing/engine.ts) descobre a organização e a assinatura guardada; aqui só se decide.
 *
 * Regras:
 *  - completed / trial_started / renewed: assinatura em dia → plano liberado até o fim do período pago. O plano vem do
 *    valor cobrado (cada plano tem um preço por ciclo), senão do checkout que o app criou, senão do que já estava.
 *  - Assinatura nova paga numa organização que já tinha outra ativa (troca de ciclo ou outro cartão): a nova vale e a
 *    antiga é cancelada na AbacatePay (nunca duas cobranças).
 *  - payment_failed: só avisa; a AbacatePay tenta de novo e, se esgotar, manda cancelled.
 *  - cancelled: o acesso continua até o fim do período já pago; disputa (chargeback) corta na hora.
 *  - plan_changed: no pedido (changeSource) só registra; quando a troca é aplicada, o plano passa a ser o do novo valor.
 *  - Eventos de assinatura antiga (já substituída), de outro ambiente (teste × produção) ou mais velhos que o último
 *    aplicado são ignorados.
 */

import type { BillingCycle } from "@/lib/plans/plans"

import { planFromAmount } from "./catalog"
import type { BillingWebhookEvent } from "./webhook"

export type StoredSubscription = {
  organizationId: string
  subscriptionId: string
  status: "active" | "cancelled"
  plan: string
  cycle: BillingCycle
  amountCents: number
  scheduledPlan: string | null
  paymentFailures: number
  providerUpdatedAt: string | null
  devMode: boolean
}

export type LinkedCheckout = {
  id: string
  organizationId: string
  plan: string
  cycle: BillingCycle
  checkoutId: string | null
  devMode: boolean | null
}

export type BillingDecision =
  | { kind: "ignore"; reason: string }
  | {
      kind: "activate"
      organizationId: string
      subscriptionId: string
      plan: string
      cycle: BillingCycle
      amountCents: number
      periodEnd: string
      paidAt: string | null
      /** Assinatura nova (primeira ou substituindo outra). */
      isNew: boolean
      /** Assinatura anterior ainda ativa que precisa ser cancelada na AbacatePay. */
      replaces: string | null
      scheduledPlan: string | null
    }
  | { kind: "payment_failed"; organizationId: string; failures: number }
  | { kind: "cancel"; organizationId: string; reason: string | null; immediate: boolean }
  | { kind: "plan_applied"; organizationId: string; plan: string; amountCents: number; cycle: BillingCycle }
  | { kind: "plan_requested"; organizationId: string }

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Data + 1 mês (ou + 1 ano), sem pular para o mês seguinte em dias 29–31 (31/01 + 1 mês = 28 ou 29/02). */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  const year = from.getUTCFullYear() + (cycle === "annual" ? 1 : 0)
  const month = from.getUTCMonth() + (cycle === "monthly" ? 1 : 0)
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = month % 12
  const day = Math.min(from.getUTCDate(), daysInMonth(targetYear, targetMonth))
  return new Date(
    Date.UTC(targetYear, targetMonth, day, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds())
  )
}

/** Mensalidade em reais (base do MRR): no anual, o valor do ano dividido por 12. */
export function monthlyPriceFromAmount(amountCents: number, cycle: BillingCycle): number {
  return Math.round((cycle === "annual" ? amountCents / 12 : amountCents)) / 100
}

/** Disputa/contestação no cartão: cancela o acesso na hora (o dinheiro está sendo devolvido). */
export function isDisputeCancellation(reason: string | null): boolean {
  return Boolean(reason && /disput|chargeback|contest/i.test(reason))
}

export function decideBillingEvent(input: {
  event: BillingWebhookEvent
  organizationId: string | null
  current: StoredSubscription | null
  checkout: LinkedCheckout | null
  now?: Date
}): BillingDecision {
  const { event, current, checkout } = input
  const now = input.now ?? new Date()
  const subscription = event.subscription
  if (!event.type.startsWith("subscription.")) return { kind: "ignore", reason: "evento que a maanu não usa" }
  if (!subscription) return { kind: "ignore", reason: "evento sem assinatura" }
  const organizationId = input.organizationId
  if (!organizationId) return { kind: "ignore", reason: "assinatura não criada pela maanu (nenhuma organização ligada)" }

  // A assinatura do evento é a que está guardada para a organização?
  const same = current && current.subscriptionId === subscription.id ? current : null
  const isCurrent = same !== null
  const expectedDevMode = checkout?.devMode ?? same?.devMode ?? null
  if (expectedDevMode !== null && expectedDevMode !== event.devMode) {
    return { kind: "ignore", reason: "evento de outro ambiente (teste × produção)" }
  }
  if (
    same?.providerUpdatedAt &&
    subscription.updatedAt &&
    new Date(subscription.updatedAt).getTime() < new Date(same.providerUpdatedAt).getTime()
  ) {
    return { kind: "ignore", reason: "evento mais antigo que o último aplicado" }
  }

  const cycle = subscription.cycle ?? checkout?.cycle ?? same?.cycle ?? null

  switch (event.type) {
    case "subscription.completed":
    case "subscription.trial_started":
    case "subscription.renewed": {
      if (subscription.status === "CANCELLED") return { kind: "ignore", reason: "assinatura já cancelada" }
      if (!isCurrent && !checkout) return { kind: "ignore", reason: "assinatura antiga ou desconhecida desta organização" }
      if (!isCurrent && event.type === "subscription.renewed" && current?.status === "active") {
        return { kind: "ignore", reason: "renovação de uma assinatura que não é a atual" }
      }
      if (!cycle) return { kind: "ignore", reason: "ciclo de cobrança desconhecido" }
      const amountPlan = planFromAmount(subscription.amountCents, cycle)
      const plan = amountPlan ?? checkout?.plan ?? same?.plan ?? null
      if (!plan) return { kind: "ignore", reason: "plano não reconhecido pelo valor" }
      const amountCents = subscription.amountCents ?? same?.amountCents ?? 0
      const paidAt = event.payment?.paidAt ?? null
      const periodEnd =
        event.type === "subscription.trial_started" && subscription.trialEndsAt
          ? subscription.trialEndsAt
          : addCycle(new Date(paidAt ?? now.toISOString()), cycle).toISOString()
      const scheduled = same?.scheduledPlan ?? null
      return {
        kind: "activate",
        organizationId,
        subscriptionId: subscription.id,
        plan,
        cycle,
        amountCents,
        periodEnd,
        paidAt,
        isNew: !isCurrent,
        replaces: !isCurrent && current?.status === "active" ? current.subscriptionId : null,
        scheduledPlan: scheduled && scheduled !== plan ? scheduled : null,
      }
    }
    case "subscription.payment_failed": {
      if (!same) return { kind: "ignore", reason: "falha de cobrança de uma assinatura que não é a atual" }
      return {
        kind: "payment_failed",
        organizationId,
        failures: Math.max(event.failure?.retryNumber ?? same.paymentFailures + 1, 1),
      }
    }
    case "subscription.cancelled": {
      if (!isCurrent) return { kind: "ignore", reason: "cancelamento de uma assinatura antiga (já substituída)" }
      return {
        kind: "cancel",
        organizationId,
        reason: subscription.cancelledDueTo,
        immediate: isDisputeCancellation(subscription.cancelledDueTo),
      }
    }
    case "subscription.plan_changed": {
      if (!isCurrent) return { kind: "ignore", reason: "troca de plano de uma assinatura que não é a atual" }
      if (event.planChange?.requested) return { kind: "plan_requested", organizationId }
      const amountCents = subscription.amountCents
      const plan = cycle ? planFromAmount(amountCents, cycle) : null
      if (!plan || !cycle || amountCents === null) return { kind: "ignore", reason: "plano novo não reconhecido pelo valor" }
      return { kind: "plan_applied", organizationId, plan, amountCents, cycle }
    }
    default:
      return { kind: "ignore", reason: "evento de assinatura que a maanu não usa" }
  }
}