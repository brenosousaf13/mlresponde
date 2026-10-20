/**
 * Rotina de segurança das perguntas (puro, testado em tests/unit/question-polling.test.ts).
 *
 * A notificação do Mercado Livre é o caminho mais rápido, mas o ML pode atrasar, perder ou simplesmente não mandar
 * (Sessão 22: o app da v2 não recebia nenhuma notificação da conta do 1º cliente). Por isso o cron de perguntas
 * também pergunta ao ML, uma vez por minuto, se chegou pergunta nova sem resposta. Até a Sessão 30 eram ~6 consultas por
 * minuto (a cada ~10 s), mas a função ficava ligada ~20 h por dia esperando entre elas (o maior custo da maanu na
 * Vercel); com a notificação do ML chegando normalmente, 1 consulta por minuto basta como rede de segurança.
 */

/**
 * Teto de consultas da rotina ao ML por minuto, somando todas as contas (1 consulta por conta por minuto).
 * O app da maanu no ML tem limite de 18.000 chamadas por hora (300/min, `max_requests_per_hour`, conferido em
 * 2026-10-13) para TUDO (ler anúncio, responder, pós-venda...): a rotina usa no máximo 1/3 disso.
 */
export const POLL_MAX_CALLS_PER_MINUTE = 100

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
