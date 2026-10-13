import "server-only"

import { computeAccess } from "@/lib/access/access"
import { processDueQuestions, processQuestion } from "@/lib/answers/engine"
import { registerQuestion } from "@/lib/answers/ingest"
import { POLL_WINDOW_MS, pollingOffsets, unknownQuestions } from "@/lib/answers/polling"
import { searchUnansweredQuestions } from "@/lib/mercadolivre/questions"
import { createServiceClient } from "@/lib/supabase/admin"

type PollAccount = { id: string; organization_id: string }

/** Contas consultadas: ativas, com token válido e organização com acesso (teste grátis ou assinatura). */
async function pollableAccounts(): Promise<PollAccount[]> {
  const { data, error } = await createServiceClient()
    .from("ml_accounts")
    .select("id, organization_id, organizations!inner(trial_ends_at, subscription_status, billing_exempt, current_period_end)")
    .eq("status", "active")
    .eq("token_status", "valid")
    .order("created_at", { ascending: true })
    .limit(2000)
  if (error) throw error
  return (data ?? [])
    .filter((account) => account.organizations && computeAccess(account.organizations).state !== "blocked")
    .map(({ id, organization_id }) => ({ id, organization_id }))
}

/** Pergunta ao ML quais perguntas estão sem resposta e registra as que a maanu ainda não tem. Devolve os ids novos. */
async function pollAccount(account: PollAccount): Promise<string[]> {
  const { questions = [] } = await searchUnansweredQuestions(account.id, 0, 50)
  if (!questions.length) return []

  const { data: known, error } = await createServiceClient()
    .from("ml_questions")
    .select("ml_question_id")
    .in(
      "ml_question_id",
      questions.map((question) => question.id)
    )
  if (error) throw error

  const created: string[] = []
  for (const question of unknownQuestions(questions, (known ?? []).map((row) => Number(row.ml_question_id)))) {
    const registered = await registerQuestion({
      organizationId: account.organization_id,
      mlAccountId: account.id,
      mlQuestionId: question.id,
      questionText: question.text,
      itemId: question.item_id,
      createdAt: question.date_created,
    })
    // isNew = false: a notificação do ML registrou a mesma pergunta no meio do caminho (ela já está sendo tratada).
    if (registered?.isNew) created.push(registered.id)
  }
  return created
}

/** Executa `task` em todos os itens, no máximo `limit` ao mesmo tempo. */
async function forEachLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

export type QuestionRoundsResult = { accounts: number; rounds: number; found: number; processed: number; failures: number }

/**
 * Cron de perguntas (1 vez por minuto): a cada ~10 s consulta o ML em todas as contas, registra as perguntas novas e
 * já manda para a IA; em cada rodada também roda a fila (novas tentativas). Funciona mesmo sem notificação do ML.
 */
export async function runQuestionRounds(
  options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<QuestionRoundsResult> {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const startedAt = now()

  const accounts = await pollableAccounts()
  const result: QuestionRoundsResult = { accounts: accounts.length, rounds: 0, found: 0, processed: 0, failures: 0 }

  for (const offset of pollingOffsets(accounts.length)) {
    const wait = startedAt + offset - now()
    if (wait > 0) await sleep(wait)
    // O processamento de uma rodada pode demorar (IA); rodada que já passou da janela fica para o próximo minuto.
    if (now() - startedAt > POLL_WINDOW_MS) break
    result.rounds++

    const created: string[] = []
    await forEachLimit(accounts, 4, async (account) => {
      try {
        created.push(...(await pollAccount(account)))
      } catch (error) {
        result.failures++
        console.error(`[perguntas] consulta da conta ${account.id}:`, error instanceof Error ? error.message : error)
      }
    })

    result.found += created.length
    await forEachLimit(created, 3, async (questionId) => {
      try {
        await processQuestion(questionId)
      } catch (error) {
        // A pergunta continua na fila (pending/processing) e a próxima rodada tenta de novo.
        console.error(`[perguntas] processar ${questionId}:`, error instanceof Error ? error.message : error)
      }
    })
    result.processed += created.length

    try {
      result.processed += await processDueQuestions(10)
    } catch (error) {
      console.error("[perguntas] fila:", error instanceof Error ? error.message : error)
    }
  }

  if (result.found) console.info(`[perguntas] rotina de segurança achou ${result.found} pergunta(s) nova(s)`)
  return result
}
