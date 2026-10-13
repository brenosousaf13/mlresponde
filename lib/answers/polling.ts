/**
 * Rotina de segurança das perguntas (puro, testado em tests/unit/question-polling.test.ts).
 *
 * A notificação do Mercado Livre é o caminho mais rápido, mas o ML pode atrasar, perder ou simplesmente não mandar
 * (Sessão 22: o app da v2 não recebia nenhuma notificação da conta do 1º cliente). Por isso o cron de perguntas
 * também pergunta ao ML, várias vezes por minuto, se chegou pergunta nova sem resposta.
 */

/** Intervalo entre as consultas quando há poucas contas. */
export const POLL_INTERVAL_MS = 10_000
/** Nenhuma rodada começa depois disto (o cron roda a cada minuto; a próxima execução continua). */
export const POLL_WINDOW_MS = 50_000
/**
 * Teto de consultas da rotina ao ML por minuto, somando todas as contas (cada rodada = 1 consulta por conta).
 * O app da maanu no ML tem limite de 18.000 chamadas por hora (300/min, `max_requests_per_hour`, conferido em
 * 2026-10-13) para TUDO (ler anúncio, responder, pós-venda...): a rotina usa no máximo 1/3 disso.
 */
export const POLL_MAX_CALLS_PER_MINUTE = 100

/** Momentos (ms desde o início da execução do cron) em que a rotina consulta o ML. */
export function pollingOffsets(accountCount: number): number[] {
  const maxRounds = Math.floor(POLL_WINDOW_MS / POLL_INTERVAL_MS) + 1
  const rounds =
    accountCount > 0 ? Math.max(1, Math.min(maxRounds, Math.floor(POLL_MAX_CALLS_PER_MINUTE / accountCount))) : 1
  const step = Math.max(POLL_INTERVAL_MS, Math.floor(60_000 / rounds))
  return Array.from({ length: rounds }, (_, index) => index * step).filter((offset) => offset <= POLL_WINDOW_MS)
}

/**
 * Contas consultadas neste minuto. Até o teto, todas; acima dele, um rodízio (cada minuto pega as próximas), para a
 * rotina nunca passar do teto — com muitas contas a notificação do ML volta a ser o caminho principal.
 */
export function accountsThisMinute<T>(accounts: T[], minuteIndex: number): T[] {
  if (accounts.length <= POLL_MAX_CALLS_PER_MINUTE) return accounts
  const start = (minuteIndex * POLL_MAX_CALLS_PER_MINUTE) % accounts.length
  return Array.from({ length: POLL_MAX_CALLS_PER_MINUTE }, (_, index) => accounts[(start + index) % accounts.length])
}

/** Perguntas que a maanu ainda não registrou (sem repetir). */
export function unknownQuestions<T extends { id: number }>(questions: T[], known: Iterable<number>): T[] {
  const seen = new Set(known)
  const result: T[] = []
  for (const question of questions) {
    if (seen.has(question.id)) continue
    seen.add(question.id)
    result.push(question)
  }
  return result
}
