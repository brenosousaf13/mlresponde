import {
  BAND_LABELS,
  COLOR_RANK,
  LEADER_LIMITS,
  LIMITS,
  METRIC_KEYS,
  MIN_SALES_FOR_REPUTATION,
  type Band,
  type BandLimits,
  type MetricKey,
  type PeriodDays,
  type ReputationColor,
} from "@/lib/reputation/thresholds"

/**
 * Termômetro do Mercado Livre → números da maanu (puro, testado em tests/unit/reputation.test.ts).
 * Só o seller_reputation de /users/{id} é lido: o resto da resposta (e-mail, documento, endereço) nunca passa por aqui.
 */

type MlMetric = {
  period?: string | null
  rate?: number | null
  value?: number | null
  excluded?: { real_value?: number | null; real_rate?: number | null } | null
}

/** seller_reputation como o ML devolve em /users/{id} (só os campos que a maanu usa). */
export type MlSellerReputation = {
  level_id?: string | null
  power_seller_status?: string | null
  real_level?: string | null
  protection_end_date?: string | null
  transactions?: {
    canceled?: number | null
    completed?: number | null
    period?: string | null
    total?: number | null
    ratings?: { negative?: number | null; neutral?: number | null; positive?: number | null } | null
  } | null
  metrics?: {
    sales?: { period?: string | null; completed?: number | null } | null
    claims?: MlMetric | null
    delayed_handling_time?: MlMetric | null
    cancellations?: MlMetric | null
  } | null
}

export type MetricReading = { value: number; rate: number }

/** Leitura do termômetro. Números "efetivos": os reais quando a conta está protegida, os do ML nos outros casos. */
export type ReputationReading = {
  levelId: string | null
  color: ReputationColor
  powerSellerStatus: string | null
  protected: boolean
  protectionEndDate: string | null
  /** Cor real durante a proteção (null quando não protegida ou o ML não informou). */
  realColor: ReputationColor | null
  periodDays: number | null
  salesCompleted: number
  metrics: Record<MetricKey, MetricReading>
}

const LEVEL_COLORS: Record<string, ReputationColor> = {
  "5_green": "green",
  "4_light_green": "light_green",
  "3_yellow": "yellow",
  "2_orange": "orange",
  "1_red": "red",
  green: "green",
  dark_green: "green",
  light_green: "light_green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
}

export function colorFromLevel(level: string | null | undefined): ReputationColor {
  if (!level) return "none"
  return LEVEL_COLORS[level.trim().toLowerCase()] ?? "none"
}

/** "60 days" → 60; "365 days" → 365; "historic" ou vazio → null. */
export function parsePeriodDays(period: string | null | undefined): number | null {
  const match = /^(\d{1,3})\s*days?$/i.exec((period ?? "").trim())
  if (!match) return null
  const days = Number(match[1])
  return days > 0 && days <= 400 ? days : null
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function fraction(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.min(number, 1)
}

function readMetric(metric: MlMetric | null | undefined, useReal: boolean): MetricReading {
  const real = metric?.excluded
  if (useReal && real && (real.real_value !== undefined || real.real_rate !== undefined)) {
    return { value: count(real.real_value), rate: fraction(real.real_rate) }
  }
  return { value: count(metric?.value), rate: fraction(metric?.rate) }
}

export function readReputation(raw: MlSellerReputation | null | undefined): ReputationReading {
  const reputation = raw ?? {}
  const metrics = reputation.metrics ?? {}
  const isProtected = Boolean(reputation.real_level || reputation.protection_end_date)
  return {
    levelId: reputation.level_id?.trim() || null,
    color: colorFromLevel(reputation.level_id),
    powerSellerStatus: reputation.power_seller_status?.trim().toLowerCase() || null,
    protected: isProtected,
    protectionEndDate: reputation.protection_end_date || null,
    realColor: isProtected && reputation.real_level ? colorFromLevel(reputation.real_level) : null,
    periodDays: parsePeriodDays(metrics.sales?.period ?? metrics.claims?.period),
    salesCompleted: count(metrics.sales?.completed),
    metrics: {
      claims: readMetric(metrics.claims, isProtected),
      cancellations: readMetric(metrics.cancellations, isProtected),
      delayed: readMetric(metrics.delayed_handling_time, isProtected),
    },
  }
}

/** Só o que interessa do seller_reputation, para guardar (sem nada pessoal). */
export function reputationRaw(raw: MlSellerReputation | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  const { level_id, power_seller_status, real_level, protection_end_date, transactions, metrics } = raw
  return { level_id, power_seller_status, real_level, protection_end_date, transactions, metrics }
}

/** Assinatura dos números: muda quando qualquer número do termômetro muda (grava um novo registro no histórico). */
export function reputationSignature(reading: ReputationReading): string {
  const metrics = METRIC_KEYS.map((key) => key + ":" + reading.metrics[key].value + "/" + reading.metrics[key].rate.toFixed(6))
  return [
    reading.levelId ?? "-",
    reading.powerSellerStatus ?? "-",
    reading.protected ? "p" : "-",
    reading.realColor ?? "-",
    reading.periodDays ?? "-",
    reading.salesCompleted,
    ...metrics,
  ].join("|")
}

/** Cor que vale para a folga: a real durante a proteção (é a que volta quando ela acaba). */
export function effectiveColor(reading: Pick<ReputationReading, "color" | "realColor" | "protected">): ReputationColor {
  return reading.protected && reading.realColor && reading.realColor !== "none" ? reading.realColor : reading.color
}

export function bandOfColor(color: ReputationColor): Band | null {
  if (color === "green" || color === "light_green") return "green"
  if (color === "none") return null
  return color
}

const BANDS: readonly Band[] = ["green", "yellow", "orange", "red"]
const EPSILON = 1e-9

export function limitsFor(key: MetricKey, periodDays: number | null): BandLimits {
  const period: PeriodDays = periodDays === 365 ? 365 : 60
  return LIMITS[key][period]
}

export function bandForRate(rate: number, limits: BandLimits): Band {
  if (rate <= limits.green + EPSILON) return "green"
  if (rate <= limits.yellow + EPSILON) return "yellow"
  if (rate <= limits.orange + EPSILON) return "orange"
  return "red"
}

export function worseBand(a: Band, b: Band): Band {
  return BANDS.indexOf(a) >= BANDS.indexOf(b) ? a : b
}

export function nextBandDown(band: Band): Band | null {
  return BANDS[BANDS.indexOf(band) + 1] ?? null
}

export function nextBandUp(band: Band): Band | null {
  const index = BANDS.indexOf(band)
  return index > 0 ? BANDS[index - 1] : null
}

/** Limite máximo da faixa (null no vermelho: não há faixa pior). */
export function upperLimit(band: Band, limits: BandLimits): number | null {
  return band === "red" ? null : limits[band]
}

export type MetricSlack = {
  key: MetricKey
  value: number
  rate: number
  /** Vendas usadas como base do percentual. */
  base: number
  /** Base estimada (o ML não deixa calcular a exata). Só para atrasos. */
  approximate: boolean
  /** Faixa desta métrica sozinha. */
  band: Band
  /** Limite (fração) da cor atual. */
  limit: number | null
  /** Quantos problemas a mais cabem antes de cair de cor (null: sem cor ou já no vermelho). */
  slack: number | null
  fallsTo: Band | null
  /** Quantos problemas precisam sair da conta para esta métrica subir de faixa (null: já no verde). */
  toImprove: number | null
  improvesTo: Band | null
  /** Folga até perder a medalha de MercadoLíder (null: não é MercadoLíder). */
  leaderSlack: number | null
}

export type ReputationSlack = {
  /** Cor que vale (a real durante a proteção). */
  color: ReputationColor
  band: Band | null
  /** Pior faixa entre as métricas (a cor calculada pela maanu). */
  computedBand: Band
  gray: boolean
  /** Vendas que faltam para ter reputação (cinza). */
  salesToStart: number | null
  metrics: MetricSlack[]
  /** Menor folga entre as métricas (null: sem cor ou no vermelho). */
  minSlack: number | null
}

/**
 * Base do percentual: valor ÷ taxa quando os dois existem (é a conta do ML); senão as vendas concluídas do período.
 * Atraso sem base exata fica marcado como aproximado (o ML mede só os envios com Mercado Envios).
 */
export function metricBase(key: MetricKey, metric: MetricReading, salesCompleted: number) {
  if (metric.value > 0 && metric.rate > 0) return { base: Math.max(metric.value, Math.round(metric.value / metric.rate)), approximate: false }
  return { base: salesCompleted, approximate: key === "delayed" }
}

/** Problemas que cabem até o limite: floor(limite × base − atuais), nunca negativo. */
export function slackUntil(limit: number, base: number, value: number): number {
  return Math.max(0, Math.floor(limit * base - value + EPSILON))
}

export function computeSlack(reading: ReputationReading): ReputationSlack {
  const color = effectiveColor(reading)
  const band = bandOfColor(color)
  const metrics = METRIC_KEYS.map((key): MetricSlack => {
    const metric = reading.metrics[key]
    const limits = limitsFor(key, reading.periodDays)
    const { base, approximate } = metricBase(key, metric, reading.salesCompleted)
    const own = bandForRate(base > 0 ? metric.value / base : metric.rate, limits)
    const limit = band ? upperLimit(band, limits) : null
    const improvesTo = nextBandUp(own)
    const improveLimit = improvesTo ? limits[improvesTo as keyof BandLimits] : null
    return {
      key,
      value: metric.value,
      rate: metric.rate,
      base,
      approximate,
      band: own,
      limit,
      slack: limit === null ? null : slackUntil(limit, base, metric.value),
      fallsTo: band && limit !== null ? nextBandDown(band) : null,
      toImprove: improveLimit === null ? null : Math.max(0, metric.value - Math.floor(improveLimit * base + EPSILON)),
      improvesTo,
      leaderSlack: reading.powerSellerStatus ? slackUntil(LEADER_LIMITS[key], base, metric.value) : null,
    }
  })
  const computedBand = metrics.reduce<Band>((worst, metric) => worseBand(worst, metric.band), "green")
  const slacks = metrics.flatMap((metric) => (metric.slack === null ? [] : [metric.slack]))
  const gray = color === "none"
  return {
    color,
    band,
    computedBand,
    gray,
    salesToStart: gray ? Math.max(0, MIN_SALES_FOR_REPUTATION - reading.salesCompleted) : null,
    metrics,
    minSlack: slacks.length ? Math.min(...slacks) : null,
  }
}

export function colorRank(color: ReputationColor): number {
  return COLOR_RANK[color]
}

/** "Você aguenta mais 2 reclamações antes de cair para amarelo." / "Nenhuma reclamação de folga: ..." */
export function slackSentence(metric: MetricSlack, labels: { singular: string; plural: string }): string | null {
  if (metric.slack === null || !metric.fallsTo) return null
  const to = BAND_LABELS[metric.fallsTo]
  if (metric.slack === 0) return "Sem folga: mais 1 " + labels.singular + " e a cor cai para " + to + "."
  const noun = metric.slack === 1 ? labels.singular : labels.plural
  return "Você aguenta mais " + metric.slack + " " + noun + " antes de cair para " + to + "."
}

