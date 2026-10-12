/** Formatação do painel do administrador (pt-BR, puro). */

const TIME_ZONE = "America/Sao_Paulo"

function safe(value: number | null | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** US$ com mais casas para valores pequenos (custo de IA é de frações de centavo). */
export function formatUsd(value: number | null | undefined) {
  const number = safe(value)
  const abs = Math.abs(number)
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs === 0 ? 2 : Math.min(digits, 2),
    maximumFractionDigits: digits,
  }).format(number)
}

/** R$ sempre com centavos (valores de cobrança). */
export function formatBrl(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(safe(value))
}

/** R$ sem centavos a partir de R$ 1.000 (números de resumo). */
export function formatBrlShort(value: number | null | undefined) {
  const number = safe(value)
  const big = Math.abs(number) >= 1000
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: big ? 0 : 2,
    maximumFractionDigits: big ? 0 : 2,
  }).format(number)
}

const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

/** Tokens: "850", "12,3 mil", "4,2 mi". */
export function formatTokens(value: number | null | undefined) {
  const number = safe(value)
  const abs = Math.abs(number)
  if (abs < 1000) return integer.format(number)
  if (abs < 1_000_000) return `${oneDecimal.format(number / 1000)} mil`
  return `${oneDecimal.format(number / 1_000_000)} mi`
}

export function formatInteger(value: number | null | undefined) {
  return integer.format(safe(value))
}

/** Parte do total em %, sem casas ("—" sem total). */
export function formatShare(part: number, total: number) {
  if (!total) return "—"
  return `${integer.format((part / total) * 100)}%`
}

/** Variação percentual entre dois valores (null quando não há base de comparação). */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function formatChange(value: number | null) {
  if (value === null) return null
  return `${value > 0 ? "+" : ""}${integer.format(value)}%`
}

export function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—"
  const ms = Number(value)
  return ms < 1000 ? `${integer.format(ms)} ms` : `${oneDecimal.format(ms / 1000)} s`
}

/** "12/10" a partir de "2026-10-12" (eixos dos gráficos). */
export function shortDay(day: string) {
  const [, month, date] = day.split("-")
  return `${date}/${month}`
}

/** "seg., 12 de out." a partir de "2026-10-12" (dicas dos gráficos). */
export function longDay(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, date))
  )
}

/** Data AAAA-MM-DD no fuso de São Paulo (valor de <input type="date">). */
export function toDateInput(value: string | null | undefined) {
  if (!value) return ""
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(value))
}

/** Converte US$ para R$ pela cotação das configurações. */
export function usdToBrl(usd: number, rate: number) {
  return safe(usd) * safe(rate)
}
