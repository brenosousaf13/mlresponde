const MINUTE = 60_000
const STEPS = [2, 4, 8, 15].map((minutes) => minutes * MINUTE)

/** Converte Retry-After (segundos ou data HTTP) em atraso relativo ao recebimento da resposta. */
export function parseRetryAfterMs(value: string | null, nowMs: number): number | undefined {
  if (!value?.trim()) return undefined
  const text = value.trim()
  const delay = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) * 1000 : Date.parse(text) - nowMs
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined
}

/**
 * Reconstitui o degrau pelo intervalo gravado da própria conta, sem estado extra no banco.
 * Sobreposição conhecida: uma conta no ritmo normal de 2 min (needsReview/waiting) pode começar em 4 min ao levar 429.
 */
export function nextRateLimitDelay({
  previousIntervalMs,
  retryAfterMs,
  random = Math.random,
}: {
  previousIntervalMs: number | null
  retryAfterMs?: number
  random?: () => number
}): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) {
    return Math.min(30 * MINUTE, Math.max(MINUTE, retryAfterMs))
  }
  const previous = STEPS.findIndex((base) => previousIntervalMs !== null
    && previousIntervalMs >= base && previousIntervalMs <= base * 1.2)
  const base = STEPS[Math.min(previous + 1, STEPS.length - 1)]
  return base * (1 + 0.2 * random())
}
