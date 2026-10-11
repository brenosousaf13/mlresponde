/**
 * Números da tela Resultados (puro: sem banco e sem React; testado em tests/unit/results.test.ts).
 * Os dados brutos vêm da função SQL `analytics_overview`.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** São Paulo não tem horário de verão desde 2019: o fuso é fixo em -03:00. */
const SAO_PAULO_OFFSET = "-03:00"

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export const PERIOD_OPTIONS = [
  { value: "7", days: 7, label: "7 dias" },
  { value: "30", days: 30, label: "30 dias" },
  { value: "90", days: 90, label: "90 dias" },
] as const

export type PeriodDays = (typeof PERIOD_OPTIONS)[number]["days"]

export const DEFAULT_PERIOD: PeriodDays = 30

export function parsePeriod(value: unknown): PeriodDays {
  const match = PERIOD_OPTIONS.find((option) => option.value === value)
  return match ? match.days : DEFAULT_PERIOD
}

/** Data local (São Paulo) no formato AAAA-MM-DD. */
export function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function addDaysToKey(key: string, days: number): string {
  const base = new Date(`${key}T12:00:00Z`)
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Últimos `days` dias contando hoje: começa à meia-noite (horário de Brasília) do primeiro dia. */
export function periodRange(days: number, now: Date = new Date()) {
  const startDay = addDaysToKey(localDateKey(now), -(days - 1))
  return { from: new Date(`${startDay}T00:00:00${SAO_PAULO_OFFSET}`), to: now, startDay }
}

// ---------------------------------------------------------------------------
// Dados brutos (resultado da função SQL)
// ---------------------------------------------------------------------------

export type OverviewTotals = {
  total: number
  ai: number
  manual: number
  external: number
  open: number
  queue: number
  ignored: number
  aiTimed: number
  humanTimed: number
  aiMedianSeconds: number | null
  aiP90Seconds: number | null
  humanMedianSeconds: number | null
}

export type DailyRow = { day: string; total: number; ai: number; human: number; open: number }
export type SpeedRow = { bucket: number; ai: number; human: number }
export type HourCell = { dow: number; hour: number; total: number; ai: number }
export type ItemRow = {
  itemId: string
  title: string | null
  permalink: string | null
  thumbnail: string | null
  total: number
  ai: number
  human: number
  open: number
}
export type Causes = { aiOff: number; noInfo: number; unsure: number }

export type AnalyticsOverview = {
  current: OverviewTotals
  previous: OverviewTotals
  daily: DailyRow[]
  speed: SpeedRow[]
  hours: HourCell[]
  items: ItemRow[]
  causes: Causes
  lifetimeAi: number
}

type Json = Record<string, unknown>

const asObject = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {})
const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value.map(asObject) : [])
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)

function parseTotals(value: unknown): OverviewTotals {
  const t = asObject(value)
  return {
    total: num(t.total),
    ai: num(t.ai),
    manual: num(t.manual),
    external: num(t.external),
    open: num(t.open),
    queue: num(t.queue),
    ignored: num(t.ignored),
    aiTimed: num(t.ai_timed),
    humanTimed: num(t.human_timed),
    aiMedianSeconds: numOrNull(t.ai_median_seconds),
    aiP90Seconds: numOrNull(t.ai_p90_seconds),
    humanMedianSeconds: numOrNull(t.human_median_seconds),
  }
}

/** Converte o JSON da função SQL em tipos seguros (campos ausentes viram zero/nulo). */
export function parseOverview(value: unknown): AnalyticsOverview {
  const raw = asObject(value)
  const causes = asObject(raw.causes)
  return {
    current: parseTotals(raw.current),
    previous: parseTotals(raw.previous),
    daily: asArray(raw.daily).map((row) => ({
      day: String(row.day ?? ""),
      total: num(row.total),
      ai: num(row.ai),
      human: num(row.human),
      open: num(row.open),
    })),
    speed: asArray(raw.speed).map((row) => ({ bucket: num(row.bucket), ai: num(row.ai), human: num(row.human) })),
    hours: asArray(raw.hours).map((row) => ({
      dow: num(row.dow),
      hour: num(row.hour),
      total: num(row.total),
      ai: num(row.ai),
    })),
    items: asArray(raw.items)
      .filter((row) => typeof row.item_id === "string")
      .map((row) => ({
        itemId: String(row.item_id),
        title: strOrNull(row.title),
        permalink: strOrNull(row.permalink),
        thumbnail: strOrNull(row.thumbnail),
        total: num(row.total),
        ai: num(row.ai),
        human: num(row.human),
        open: num(row.open),
      })),
    causes: { aiOff: num(causes.ai_off), noInfo: num(causes.no_info), unsure: num(causes.unsure) },
    lifetimeAi: num(raw.lifetime_ai),
  }
}

// ---------------------------------------------------------------------------
// Comparações e porcentagens
// ---------------------------------------------------------------------------

/** Parte de um total, em % inteiro (0 quando não há total). */
export function share(part: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.round((part / total) * 100)
}

/** Variação em % contra o período anterior; nulo quando não há base de comparação. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Quantas vezes a IA é mais rápida que a pessoa (nulo se faltar dado ou se a diferença for pequena). */
export function speedFactor(aiSeconds: number | null, humanSeconds: number | null): number | null {
  if (aiSeconds === null || humanSeconds === null || humanSeconds <= 0) return null
  const factor = humanSeconds / Math.max(aiSeconds, 1)
  if (factor < 1.5) return null
  if (factor < 10) return Math.round(factor * 10) / 10
  if (factor < 100) return Math.round(factor)
  return Math.round(factor / 10) * 10
}

// ---------------------------------------------------------------------------
// Economia estimada
// ---------------------------------------------------------------------------

export const ASSUMPTION_LIMITS = {
  minutesPerAnswer: { min: 0.5, max: 60, default: 3 },
  hourlyCost: { min: 1, max: 10000, default: 20 },
} as const

export type Assumptions = { minutesPerAnswer: number; hourlyCost: number }

export type Savings = {
  /** Horas de atendimento que a IA fez no lugar de uma pessoa. */
  hours: number
  /** Valor dessas horas (R$). */
  amount: number
  /** Em dias de trabalho de 8 horas. */
  workDays: number
  /** No ritmo do período, quanto isso dá em 30 dias (R$). */
  monthlyAmount: number
  /** No ritmo do período, quanto isso dá em 12 meses (R$). */
  yearlyAmount: number
}

export function estimateSavings(input: { answers: number; days: number } & Assumptions): Savings {
  const answers = Math.max(0, input.answers)
  const hours = (answers * input.minutesPerAnswer) / 60
  const amount = hours * input.hourlyCost
  const days = Math.max(1, input.days)
  const perDay = amount / days
  return { hours, amount, workDays: hours / 8, monthlyAmount: perDay * 30, yearlyAmount: perDay * 365 }
}

// ---------------------------------------------------------------------------
// Horário comercial (seg a sex, 8h às 18h) e espera evitada
// ---------------------------------------------------------------------------

export const BUSINESS_HOURS = { days: [1, 2, 3, 4, 5] as readonly number[], open: 8, close: 18 }
export const BUSINESS_HOURS_LABEL = "segunda a sexta, das 8h às 18h"
export const BUSINESS_HOURS_SHORT = "seg. a sex., 8h às 18h"

/** isoDow: 1 = segunda ... 7 = domingo. */
export function isBusinessHour(isoDow: number, hour: number): boolean {
  return BUSINESS_HOURS.days.includes(isoDow) && hour >= BUSINESS_HOURS.open && hour < BUSINESS_HOURS.close
}

/** Horas até o próximo início de expediente (0 se já está no horário comercial). */
export function hoursUntilOpen(isoDow: number, hour: number): number {
  if (isBusinessHour(isoDow, Math.floor(hour))) return 0
  if (BUSINESS_HOURS.days.includes(isoDow) && hour < BUSINESS_HOURS.open) return BUSINESS_HOURS.open - hour
  let wait = 24 - hour
  let dow = (isoDow % 7) + 1
  while (!BUSINESS_HOURS.days.includes(dow)) {
    wait += 24
    dow = (dow % 7) + 1
  }
  return wait + BUSINESS_HOURS.open
}

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const

export type HoursSummary = {
  /** matrix[dia 0..6 (seg..dom)][hora 0..23] = perguntas recebidas */
  matrix: number[][]
  aiMatrix: number[][]
  max: number
  total: number
  offHoursTotal: number
  offHoursAi: number
  offHoursShare: number
  /** % das perguntas no sábado e domingo. */
  weekendShare: number
  /** % das perguntas em dias úteis, antes das 8h ou depois das 18h. */
  weekdayNightShare: number
  /** Soma das horas que os compradores esperariam pelo próximo expediente, nas perguntas que a IA respondeu fora dele. */
  waitAvoidedHours: number
  peak: { dow: number; hour: number; total: number } | null
}

export function summarizeHours(cells: HourCell[]): HoursSummary {
  const matrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const aiMatrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  let total = 0
  let offHoursTotal = 0
  let offHoursAi = 0
  let weekendTotal = 0
  let weekdayNightTotal = 0
  let waitAvoidedHours = 0
  let peak: HoursSummary["peak"] = null

  for (const cell of cells) {
    if (cell.dow < 1 || cell.dow > 7 || cell.hour < 0 || cell.hour > 23) continue
    matrix[cell.dow - 1][cell.hour] += cell.total
    aiMatrix[cell.dow - 1][cell.hour] += cell.ai
    total += cell.total
    if (!isBusinessHour(cell.dow, cell.hour)) {
      offHoursTotal += cell.total
      if (BUSINESS_HOURS.days.includes(cell.dow)) weekdayNightTotal += cell.total
      else weekendTotal += cell.total
      offHoursAi += cell.ai
      // Meio da hora como estimativa do momento da pergunta.
      waitAvoidedHours += cell.ai * hoursUntilOpen(cell.dow, cell.hour + 0.5)
    }
  }

  let max = 0
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const value = matrix[d][h]
      if (value > max) max = value
      if (value > 0 && (!peak || value > peak.total)) peak = { dow: d + 1, hour: h, total: value }
    }
  }

  return {
    matrix,
    aiMatrix,
    max,
    total,
    offHoursTotal,
    offHoursAi,
    offHoursShare: share(offHoursTotal, total),
    weekendShare: share(weekendTotal, total),
    weekdayNightShare: share(weekdayNightTotal, total),
    waitAvoidedHours,
    peak,
  }
}

// ---------------------------------------------------------------------------
// Série diária e velocidade
// ---------------------------------------------------------------------------

export type DailyPoint = DailyRow & { label: string; fullLabel: string }

const fullDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** Preenche os dias sem perguntas com zero, do primeiro dia do período até hoje. */
export function fillDaily(rows: DailyRow[], startDay: string, days: number): DailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  return Array.from({ length: days }, (_, index) => {
    const day = addDaysToKey(startDay, index)
    const row = byDay.get(day)
    const [, month, dayOfMonth] = day.split("-")
    return {
      day,
      label: `${dayOfMonth}/${month}`,
      fullLabel: fullDay.format(new Date(`${day}T12:00:00Z`)),
      total: row?.total ?? 0,
      ai: row?.ai ?? 0,
      human: row?.human ?? 0,
      open: row?.open ?? 0,
    }
  })
}

export const SPEED_BUCKETS = ["Até 1 min", "1 a 5 min", "5 a 60 min", "1 a 24 h", "Mais de 1 dia"] as const

export type SpeedPoint = { label: string; ai: number; human: number; aiCount: number; humanCount: number }

/** Distribuição do tempo de resposta (em % das respostas de cada um). */
export function speedDistribution(rows: SpeedRow[]): SpeedPoint[] {
  const aiTotal = rows.reduce((sum, row) => sum + row.ai, 0)
  const humanTotal = rows.reduce((sum, row) => sum + row.human, 0)
  return SPEED_BUCKETS.map((label, bucket) => {
    const row = rows.find((candidate) => candidate.bucket === bucket)
    const aiCount = row?.ai ?? 0
    const humanCount = row?.human ?? 0
    return { label, ai: share(aiCount, aiTotal), human: share(humanCount, humanTotal), aiCount, humanCount }
  })
}

// ---------------------------------------------------------------------------
// Assuntos mais perguntados (classificação por palavras-chave)
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** A ordem importa: o primeiro assunto que casar vence. */
export const TOPICS = [
  {
    id: "frete",
    label: "Frete e prazo de entrega",
    tip: "Deixe o prazo e as opções de envio claros no anúncio.",
    pattern:
      /\b(frete|envi\w*|entreg\w*|prazo|cheg\w*|correios?|sedex|transportadora|rastre\w*|despach\w*|postag\w*|cep|mercado envios|full)\b/,
  },
  {
    id: "retirada",
    label: "Retirada e endereço",
    tip: "Diga no anúncio se faz retirada e onde.",
    pattern: /\b(retir\w*|buscar|pessoalmente|loja fisica|endereco|em maos)\b/,
  },
  {
    id: "nota",
    label: "Nota fiscal",
    tip: "Informe no anúncio que emite nota fiscal.",
    pattern: /\b(nota fiscal|nota|nf|nfe|nf-e|cnpj)\b/,
  },
  {
    id: "garantia",
    label: "Garantia, troca e devolução",
    tip: "Coloque a política de garantia e troca na descrição.",
    pattern: /\b(garantia|troc\w*|devol\w*|defeito\w*|reembols\w*|arrepend\w*)\b/,
  },
  {
    id: "preco",
    label: "Preço, desconto e pagamento",
    tip: "Pedidos de desconto ficam com você; a IA não negocia preço.",
    pattern:
      /\b(desconto\w*|preco|valor|pix|boleto|parcel\w*|cartao|juros|barat\w*|promoc\w*|cupo\w*|a vista|faz por|negoci\w*)\b/,
  },
  {
    id: "medidas",
    label: "Medidas, tamanho e peso",
    tip: "Inclua a tabela de medidas e o peso suportado no anúncio.",
    pattern:
      /(\b(tamanhos?|medidas?|altura|largura|comprimento|profundidade|diametro|centimetros?|metros?|polegadas?|peso|pesa|aguenta|suporta|numeracao|veste|tabela|cabe)\b|\b\d+([.,]\d+)?\s?(cm|mm|m|kg|g|ml|l|litros?)\b)/,
  },
  {
    id: "compatibilidade",
    label: "Compatibilidade e modelo",
    tip: "Liste no anúncio os modelos compatíveis.",
    pattern:
      /\b(compativ\w*|compatibilidade|serve (no|na|em|para|pra|pro|com)|funciona (no|na|em|com|para|pra)|encaix\w*|modelo|versao)\b/,
  },
  {
    id: "estoque",
    label: "Cores, variações e estoque",
    tip: "Mantenha as variações e o estoque atualizados no anúncio.",
    pattern:
      /\b(cor|cores|estoque|disponivel|disponibilidade|pronta entrega|ainda tem|variac\w*|sabor\w*|azul|pret[oa]|branc[oa]|vermelh[oa]|rosa|verde|amarel[oa]|cinza|bege|marrom|roxo|laranja|dourad[oa]|prata)\b/,
  },
  {
    id: "especificacoes",
    label: "Material, especificações e o que vem na caixa",
    tip: "Detalhe material, especificações e itens inclusos na descrição.",
    pattern:
      /\b(material|tecido|feit[oa]|composicao|voltagem|bivolt|110v?|220v?|bateria|potencia|watts?|original|marca|especificac\w*|qualidade|resistente|impermeavel|acompanha|vem com|inclui\w*|kit|montad\w*|instala\w*|manual)\b/,
  },
] as const

export type TopicId = (typeof TOPICS)[number]["id"] | "outros"

export function classifyTopic(text: string): TopicId {
  const normalized = normalizeText(text)
  if (!normalized) return "outros"
  for (const topic of TOPICS) {
    if (topic.pattern.test(normalized)) return topic.id
  }
  return "outros"
}

export type TopicSummary = { id: TopicId; label: string; tip: string | null; count: number; share: number; examples: string[] }

/** Agrupa as perguntas por assunto, do mais perguntado para o menos (o "outros" vai por último). */
export function summarizeTopics(texts: string[], { examples = 2 }: { examples?: number } = {}) {
  const counts = new Map<TopicId, { count: number; examples: string[] }>()
  let total = 0
  for (const text of texts) {
    const clean = text.replace(/\s+/g, " ").trim()
    if (!clean) continue
    total += 1
    const id = classifyTopic(clean)
    const entry = counts.get(id) ?? { count: 0, examples: [] }
    entry.count += 1
    if (entry.examples.length < examples && clean.length <= 140 && !entry.examples.includes(clean)) entry.examples.push(clean)
    counts.set(id, entry)
  }

  const topics: TopicSummary[] = [...counts.entries()].map(([id, entry]) => {
    const topic = TOPICS.find((candidate) => candidate.id === id)
    return {
      id,
      label: topic?.label ?? "Outros assuntos",
      tip: topic?.tip ?? null,
      count: entry.count,
      share: share(entry.count, total),
      examples: entry.examples,
    }
  })
  topics.sort((a, b) => {
    if (a.id === "outros") return 1
    if (b.id === "outros") return -1
    return b.count - a.count
  })
  return { total, topics }
}