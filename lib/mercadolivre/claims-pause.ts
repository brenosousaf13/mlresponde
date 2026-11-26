import { nextRateLimitDelay, STEPS } from "@/lib/recovery/rate-limit"

const MINUTE = 60_000
export const CLAIMS_PAUSE_MEMORY_MS = 20 * MINUTE

/** Guarda o degrau nos microssegundos do horário, sem coluna nova. Arredonda para cima para respeitar Retry-After. */
export function encodePauseUntil(ms: number, stepIndex: number): string {
  if (!Number.isFinite(ms) || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= STEPS.length) {
    throw new RangeError("Horário ou degrau de pausa inválido.")
  }
  const fractionMs = 900 + stepIndex * 10
  let second = Math.floor(ms / 1000) * 1000
  if (second + fractionMs < ms) second += 1000
  return new Date(second).toISOString().replace(/\.\d{3}Z$/, `.9${stepIndex}0777Z`)
}

/** Só reconhece a marca completa; aceita também o fuso UTC devolvido pelo PostgREST. */
export function decodePauseStep(isoString: string): number | null {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.9([0-3])0777(?:Z|\+00:00)$/.exec(isoString)
  return match && Number.isFinite(Date.parse(isoString)) ? Number(match[1]) : null
}

/** Uma coluna por conta; horários normais não escondem uma pausa marcada menor. */
export function latestClaimsPause(rows: readonly { next_returns_at: string }[]): string | null {
  return rows.reduce<string | null>((latest, row) => decodePauseStep(row.next_returns_at) !== null
    && (latest === null || Date.parse(row.next_returns_at) > Date.parse(latest)) ? row.next_returns_at : latest, null)
}

export function nextClaimsPause({ nowMs, previousUntil, retryAfterMs, random }: {
  nowMs: number
  previousUntil: string | null
  retryAfterMs?: number
  random?: () => number
}): { until: string; stepIndex: number } {
  const previousStep = previousUntil ? decodePauseStep(previousUntil) : null
  const recent = previousStep !== null && nowMs - Date.parse(previousUntil!) < CLAIMS_PAUSE_MEMORY_MS
  const stepIndex = recent ? Math.min(previousStep + 1, STEPS.length - 1) : 0
  const delay = nextRateLimitDelay({ previousIntervalMs: recent ? STEPS[previousStep] : null, retryAfterMs, random })
  const until = encodePauseUntil(nowMs + delay, stepIndex)
  // Uma pausa vigente maior continua com a marca original, inclusive seu degrau.
  return previousStep !== null && Date.parse(previousUntil!) > Date.parse(until)
    ? { until: previousUntil!, stepIndex: previousStep }
    : { until, stepIndex }
}
