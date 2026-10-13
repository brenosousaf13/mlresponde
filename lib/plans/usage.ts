/**
 * Uso dos limites do plano (puro, testado em tests/unit/plans.test.ts).
 *
 * Conta como "resposta automática": pergunta respondida pela IA (inclusive a mensagem padrão do modo "Responder
 * sempre") e mensagem de pós-venda enviada pelo agente. Não contam: sugestão da IA, Testar, resposta manual e
 * pergunta que ficou com o vendedor. A contagem é feita no banco (public.organization_ai_answers).
 *
 * Período: mês do calendário no horário de Brasília (renova todo dia 1º). No teste grátis, o teste inteiro.
 */

import { formatDate } from "@/lib/format"
import { TRIAL_PLAN, type PlanInfo } from "@/lib/plans/plans"

/** Brasília não tem horário de verão desde 2019: o fuso é fixo em -03:00. */
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000

export type UsagePeriod = { from: Date; to: Date; kind: "month" | "trial" }

/** Mês do calendário (Brasília) que contém `now`. */
export function monthPeriod(now: Date = new Date()): UsagePeriod {
  const local = new Date(now.getTime() - SAO_PAULO_OFFSET_MS)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1) + SAO_PAULO_OFFSET_MS)
  const to = new Date(Date.UTC(year, month + 1, 1) + SAO_PAULO_OFFSET_MS)
  return { from, to, kind: "month" }
}

/** Período em que o uso do plano é contado. */
export function usagePeriod(
  plan: PlanInfo,
  organization: { createdAt: string; trialEndsAt: string },
  now: Date = new Date()
): UsagePeriod {
  if (plan.id === TRIAL_PLAN.id) {
    const from = new Date(organization.createdAt)
    const to = new Date(organization.trialEndsAt)
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from) return { from, to, kind: "trial" }
  }
  return monthPeriod(now)
}

export type QuotaLevel = "unlimited" | "ok" | "warning" | "reached"

export type Quota = {
  used: number
  /** null = sem limite. */
  limit: number | null
  remaining: number | null
  /** 0 a 100 (para a barra). */
  percent: number
  level: QuotaLevel
}

/** A partir de quanto do limite o aviso aparece. */
export const QUOTA_WARNING_RATIO = 0.8

export function quotaStatus(used: number, limit: number | null): Quota {
  const safeUsed = Math.max(0, Math.floor(used || 0))
  if (limit === null) return { used: safeUsed, limit: null, remaining: null, percent: 0, level: "unlimited" }
  const safeLimit = Math.max(0, Math.floor(limit))
  const remaining = Math.max(0, safeLimit - safeUsed)
  const percent = safeLimit === 0 ? 100 : Math.min(100, Math.round((safeUsed / safeLimit) * 100))
  const level: QuotaLevel =
    safeUsed >= safeLimit ? "reached" : safeUsed >= safeLimit * QUOTA_WARNING_RATIO ? "warning" : "ok"
  return { used: safeUsed, limit: safeLimit, remaining, percent, level }
}

/** Ainda cabe mais uma no limite? */
export function hasQuotaLeft(used: number, limit: number | null): boolean {
  return limit === null || used < limit
}

/** "Renova em 1 de novembro de 2026" ou "No teste grátis, até 20 de outubro de 2026". */
export function periodText(period: UsagePeriod): string {
  return period.kind === "trial"
    ? `No teste grátis, até ${formatDate(period.to)}`
    : `Renova em ${formatDate(period.to)}`
}
