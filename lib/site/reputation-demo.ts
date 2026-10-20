/**
 * Simulador do Escudo de Reputação na página de vendas (puro, testado em tests/unit/site-reputation-demo.test.ts).
 * Usa os limites oficiais de lib/reputation (os mesmos do app) numa loja de exemplo, só com a métrica de reclamações.
 */
import { bandForRate, limitsFor, nextBandDown, nextBandUp, slackUntil, upperLimit } from "@/lib/reputation/metrics"
import { BAND_LABELS, THRESHOLDS_CHECKED_AT, type Band } from "@/lib/reputation/thresholds"

/** Loja de exemplo: vendas concluídas nos últimos 60 dias (com 101 ou mais, o ML mede pelos últimos 60 dias). */
export const DEMO_SALES = 300
export const DEMO_PERIOD_DAYS = 60

/** Faixa do controle de reclamações (máximo = 10% das vendas, já no vermelho). */
export const DEMO_CLAIMS = { min: 0, max: 30, initial: 2 } as const

/** Fim da régua do termômetro (fração das vendas). */
export const DEMO_SCALE_MAX = DEMO_CLAIMS.max / DEMO_SALES

const EPSILON = 1e-9

export type DemoState = {
  claims: number
  rate: number
  band: Band
  /** Quantas reclamações a mais cabem antes de cair de cor (null no vermelho). */
  slack: number | null
  fallsTo: Band | null
  /** Quantas precisam sair da conta para subir de cor (null no verde). */
  toImprove: number | null
  improvesTo: Band | null
}

const LIMITS = limitsFor("claims", DEMO_PERIOD_DAYS)

export function simulateClaims(claims: number, sales: number = DEMO_SALES): DemoState {
  const value = Math.max(0, Math.round(claims))
  const rate = sales > 0 ? value / sales : 0
  const band = bandForRate(rate, LIMITS)
  const limit = upperLimit(band, LIMITS)
  const improvesTo = nextBandUp(band)
  const improveLimit = improvesTo && improvesTo !== "red" ? LIMITS[improvesTo] : null
  return {
    claims: value,
    rate,
    band,
    slack: limit === null ? null : slackUntil(limit, sales, value),
    fallsTo: nextBandDown(band),
    toImprove: improveLimit === null ? null : Math.max(1, value - Math.floor(improveLimit * sales + EPSILON)),
    improvesTo,
  }
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/** A frase que o app mostra no cartão do termômetro, para a loja de exemplo. */
export function demoSentence(state: DemoState): string {
  if (state.slack !== null && state.fallsTo) {
    const to = BAND_LABELS[state.fallsTo]
    if (state.slack === 0) return `Sem folga: mais 1 reclamação e a cor cai para ${to}.`
    return `Você aguenta mais ${state.slack} ${plural(state.slack, "reclamação", "reclamações")} antes de cair para ${to}.`
  }
  if (state.toImprove !== null && state.improvesTo) {
    const count = state.toImprove
    return `Para voltar ao ${BAND_LABELS[state.improvesTo]}, ${count} ${plural(count, "reclamação precisa", "reclamações precisam")} sair da conta.`
  }
  return ""
}

/** Faixas da régua (início e fim em fração das vendas), do verde ao vermelho. */
export function demoZones(): { band: Band; from: number; to: number }[] {
  return [
    { band: "green", from: 0, to: LIMITS.green },
    { band: "yellow", from: LIMITS.green, to: LIMITS.yellow },
    { band: "orange", from: LIMITS.yellow, to: LIMITS.orange },
    { band: "red", from: LIMITS.orange, to: DEMO_SCALE_MAX },
  ]
}

export type PerkStatus = "on" | "partial" | "off"

export type DemoPerk = { id: string; label: string; detail: string; status: PerkStatus }

/** O que cada cor libera (mesmas regras de COLOR_PERKS em lib/reputation/thresholds.ts). */
export function perksFor(band: Band): DemoPerk[] {
  const greenOrYellow = band === "green" || band === "yellow"
  return [
    {
      id: "frete",
      label: "Desconto no frete",
      detail: band === "green" ? "até 50%" : band === "yellow" ? "até 40%" : "nenhum",
      status: band === "green" ? "on" : band === "yellow" ? "partial" : "off",
    },
    { id: "flex", label: "Envios Flex", detail: greenOrYellow ? "liberado" : "bloqueado", status: greenOrYellow ? "on" : "off" },
    {
      id: "ads",
      label: "Product Ads",
      detail: greenOrYellow ? "liberado" : "bloqueado",
      status: greenOrYellow ? "on" : "off",
    },
    {
      id: "campanhas",
      label: "Campanhas de desconto",
      detail: band === "green" ? "liberadas" : "só no verde",
      status: band === "green" ? "on" : "off",
    },
  ]
}

/** "outubro de 2026": quando os limites oficiais foram conferidos (rodapé da seção). */
export function thresholdsCheckedLabel(): string {
  const [year, month] = THRESHOLDS_CHECKED_AT.split("-").map(Number)
  const name = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" })
  return `${name} de ${year}`
}

/** "2%", "4,5%": percentual curto. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}
