const MINUTE = 60_000

/** Converte Retry-After (segundos ou data HTTP) em atraso relativo ao recebimento da resposta. */
export function parseRetryAfterMs(value: string | null, nowMs: number): number | undefined {
  if (!value?.trim()) return undefined
  const text = value.trim()
  const delay = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) * 1000 : Date.parse(text) - nowMs
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined
}

/** Sem escada: 60–78 s. Retry-After válido prevalece, entre 1 e 5 min, sem jitter. */
export function nextRateLimitDelay({
  retryAfterMs,
  random = Math.random,
}: {
  retryAfterMs?: number
  random?: () => number
}): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) {
    return Math.min(5 * MINUTE, Math.max(MINUTE, retryAfterMs))
  }
  return MINUTE * (1 + 0.3 * random())
}
