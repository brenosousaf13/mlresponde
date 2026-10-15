/**
 * Calculadora da página de vendas (puro, testado em tests/unit/site.test.ts).
 * A conta é a mesma da tela Resultados: respostas × minutos por resposta ÷ 60 × custo da hora
 * (padrões 3 min e R$ 20/h, iguais às premissas de organizations.analytics_*).
 * De propósito, NÃO indica plano: ver um plano caro poderia afastar a pessoa do teste grátis (pedido do Breno).
 */
import type { SellablePlan } from "@/lib/plans/plans"

export const DAYS_PER_MONTH = 30

export const CALCULATOR_DEFAULTS = { questionsPerDay: 20, minutesPerAnswer: 3, hourlyCost: 20 } as const

export const CALCULATOR_LIMITS = {
  questionsPerDay: { min: 1, max: 200, step: 1 },
  minutesPerAnswer: { min: 1, max: 10, step: 1 },
  hourlyCost: { min: 10, max: 150, step: 5 },
} as const

export type SavingsInput = { questionsPerDay: number; minutesPerAnswer: number; hourlyCost: number }

export type SavingsEstimate = {
  questionsPerMonth: number
  hoursPerMonth: number
  moneyPerMonth: number
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function estimateSavings(input: SavingsInput): SavingsEstimate {
  const questionsPerDay = clamp(
    Math.round(input.questionsPerDay),
    CALCULATOR_LIMITS.questionsPerDay.min,
    CALCULATOR_LIMITS.questionsPerDay.max
  )
  const minutes = clamp(input.minutesPerAnswer, CALCULATOR_LIMITS.minutesPerAnswer.min, CALCULATOR_LIMITS.minutesPerAnswer.max)
  const hourlyCost = clamp(input.hourlyCost, CALCULATOR_LIMITS.hourlyCost.min, CALCULATOR_LIMITS.hourlyCost.max)

  const questionsPerMonth = questionsPerDay * DAYS_PER_MONTH
  const hoursPerMonth = (questionsPerMonth * minutes) / 60
  return { questionsPerMonth, hoursPerMonth, moneyPerMonth: hoursPerMonth * hourlyCost }
}

/** Mensalidade ÷ 30 dias (o "R$ 3,23 por dia" da página). */
export function pricePerDay(plan: SellablePlan): number {
  return plan.priceMonthly / DAYS_PER_MONTH
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const brlWhole = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

/** "R$ 3,23" (com centavos). */
export function formatBRL(value: number): string {
  return brl.format(value).replace(/\u00a0/g, " ")
}

/** "R$ 1.240" (sem centavos). */
export function formatBRLWhole(value: number): string {
  return brlWhole.format(Math.round(value)).replace(/\u00a0/g, " ")
}

/** "1.240". */
export function formatInteger(value: number): string {
  return integer.format(Math.round(value))
}
