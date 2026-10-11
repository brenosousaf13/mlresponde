/** Formatação dos números da tela Resultados (pt-BR). */

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

export function formatNumber(value: number) {
  return integer.format(Math.round(value))
}

/** R$ sem centavos a partir de R$ 100 (número de resumo, não de fatura). */
export function formatCurrency(value: number) {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: safe >= 100 ? 0 : 2,
    maximumFractionDigits: safe >= 100 ? 0 : 2,
  }).format(safe)
}

/** Horas de trabalho: "45 min", "3,5 h", "120 h". */
export function formatHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 10) return `${oneDecimal.format(hours)} h`
  return `${integer.format(Math.round(hours))} h`
}

/** Dias de trabalho de 8 h: "meio dia", "1 dia", "2,5 dias". */
export function formatWorkDays(days: number) {
  if (!Number.isFinite(days) || days <= 0) return "0 dia"
  if (days < 0.75) return "menos de 1 dia"
  const rounded = days < 10 ? Math.round(days * 2) / 2 : Math.round(days)
  return `${oneDecimal.format(rounded)} ${rounded === 1 ? "dia" : "dias"}`
}

export function formatPercentChange(value: number) {
  return `${value > 0 ? "+" : ""}${integer.format(value)}%`
}

export function formatFactor(value: number) {
  return `${oneDecimal.format(value)}x`
}