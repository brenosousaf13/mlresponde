import { nextRateLimitDelay } from "@/lib/recovery/rate-limit"

/**
 * Ritmo total dos dois crons para TODO /post-purchase/, compartilhado por todas as contas do app.
 * Em produção, na E3, o Recuperador conseguia ~4 chamadas/min e a Reputação várias dezenas por rodada antes do 429.
 * 8/min com pausa curta de ~1 min é o ponto de partida, ajustável por esta constante.
 */
export const ML_POST_PURCHASE_CALLS_PER_MINUTE = 8
/** O Recuperador roda a cada minuto e reserva 5 chamadas/min para todo /post-purchase/. */
export const RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE = 5
/** A Reputação usa o restante: 3 chamadas/min × 2 min; cabe a busca + 1 detalhe completo por rodada. */
export const REPUTATION_POST_PURCHASE_CALLS_PER_RUN =
  (ML_POST_PURCHASE_CALLS_PER_MINUTE - RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE) * 2

/** Pausa curta, sem memória ou degraus. A agenda de cada conta guarda o horário normalmente. */
export function nextClaimsPause({ nowMs, retryAfterMs, random }: {
  nowMs: number
  retryAfterMs?: number
  random?: () => number
}): { until: string } {
  return { until: new Date(nowMs + nextRateLimitDelay({ retryAfterMs, random })).toISOString() }
}
