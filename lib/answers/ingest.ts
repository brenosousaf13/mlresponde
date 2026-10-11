import "server-only"

import { searchUnansweredQuestions } from "@/lib/mercadolivre/questions"
import { createServiceClient } from "@/lib/supabase/admin"

/** Registra a pergunta (se ainda não existir). Retorna o id da linha e se ela é nova. */
export async function registerQuestion(params: {
  organizationId: string
  mlAccountId: string
  mlQuestionId: number
  questionText?: string
  itemId?: string
  createdAt?: string
}) {
  const admin = createServiceClient()
  const { data: inserted, error } = await admin
    .from("ml_questions")
    .upsert(
      {
        organization_id: params.organizationId,
        ml_account_id: params.mlAccountId,
        ml_question_id: params.mlQuestionId,
        question_text: params.questionText ?? "",
        item_id: params.itemId ?? null,
        question_created_at: params.createdAt ?? null,
      },
      { onConflict: "ml_question_id", ignoreDuplicates: true }
    )
    .select("id")
  if (error) throw error
  if (inserted?.length) return { id: inserted[0].id, isNew: true, status: "pending" }

  const { data: existing, error: existingError } = await admin
    .from("ml_questions")
    .select("id, status, ml_account_id")
    .eq("ml_question_id", params.mlQuestionId)
    .single()
  if (existingError) throw existingError
  if (existing.ml_account_id !== params.mlAccountId) return null
  return { id: existing.id, isNew: false, status: existing.status }
}

/** Busca no ML as perguntas sem resposta da conta e registra as que faltam. */
export async function syncUnansweredQuestions(accountId: string, maxPages = 4) {
  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select("id, organization_id, status")
    .eq("id", accountId)
    .single()
  if (error) throw error
  if (account.status !== "active") return { found: 0, created: [] as string[] }

  const created: string[] = []
  let found = 0
  for (let page = 0; page < maxPages; page++) {
    const result = await searchUnansweredQuestions(accountId, page * 50)
    const questions = result.questions ?? []
    found += questions.length
    for (const question of questions) {
      const registered = await registerQuestion({
        organizationId: account.organization_id,
        mlAccountId: account.id,
        mlQuestionId: question.id,
        questionText: question.text,
        itemId: question.item_id,
        createdAt: question.date_created,
      })
      if (registered?.isNew) created.push(registered.id)
    }
    if (questions.length < 50 || (result.total ?? 0) <= (page + 1) * 50) break
  }
  return { found, created }
}
