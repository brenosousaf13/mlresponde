import "server-only"

import { computeAccess } from "@/lib/access/access"
import { PlatformAiPausedError } from "@/lib/ai/usage"
import { runAnswerModel, type AiRun } from "@/lib/answers/ai"
import { composeAnswer } from "@/lib/answers/compose"
import { assistantBase, loadTaughtExamples } from "@/lib/answers/context"
import {
  RETRY_LIMIT,
  decideAnswer,
  parseAnswerMode,
  retryDelayMs,
  type ReviewReason,
} from "@/lib/answers/decision"
import type { PromptInput } from "@/lib/answers/prompt"
import { answersQuotaFor } from "@/lib/dal/plan"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { summarizeItem } from "@/lib/mercadolivre/item"
import {
  fetchItemAnsweredQuestions,
  fetchItemContext,
  fetchQuestion,
  postAnswer,
  type MlQuestion,
} from "@/lib/mercadolivre/questions"
import type { Database } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

type QuestionRow = Database["public"]["Tables"]["ml_questions"]["Row"]
type QuestionUpdate = Database["public"]["Tables"]["ml_questions"]["Update"]
type ServiceClient = ReturnType<typeof createServiceClient>

const ACCOUNT_FIELDS =
  "id, organization_id, ml_user_id, nickname, status, token_status, auto_reply_enabled, ai_confidence_threshold, answer_tone, answer_mode, fallback_answer, answer_greeting, answer_signature, store_briefing, store_profile, organizations(name, plan, created_at, monthly_answers_limit, trial_ends_at, subscription_status, current_period_end, billing_exempt)"

async function loadAccount(admin: ServiceClient, accountId: string) {
  const { data, error } = await admin.from("ml_accounts").select(ACCOUNT_FIELDS).eq("id", accountId).single()
  if (error) throw error
  return data
}

type AccountRow = Awaited<ReturnType<typeof loadAccount>>

function normalize(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim()
}

async function save(admin: ServiceClient, id: string, values: QuestionUpdate) {
  const { error } = await admin.from("ml_questions").update(values).eq("id", id)
  if (error) throw error
}

function questionFields(question: MlQuestion): QuestionUpdate {
  return {
    question_text: question.text,
    item_id: question.item_id,
    buyer_id: question.from?.id ?? null,
    question_created_at: question.date_created,
  }
}

/** Pergunta que deixou de estar pendente no ML (respondida lá, apagada, banida...). */
function closedOnMercadoLivre(row: QuestionRow, question: MlQuestion): QuestionUpdate {
  if (question.status === "ANSWERED" && question.answer?.text) {
    const answeredByUs = Boolean(row.answer_text) && normalize(row.answer_text) === normalize(question.answer.text)
    return {
      status: answeredByUs ? "answered" : "answered_outside",
      answer_text: question.answer.text,
      answer_source: answeredByUs ? (row.answer_source ?? "ai") : "external",
      answered_at: row.answered_at ?? question.answer.date_created ?? new Date().toISOString(),
      review_reason: null,
      locked_until: null,
      last_error: null,
    }
  }
  return { status: "ignored", review_reason: null, locked_until: null }
}

async function buildPromptContext(admin: ServiceClient, account: AccountRow, row: QuestionRow, question: MlQuestion) {
  // Anúncio completo (dados, ficha, variações, descrição, catálogo e medidas). Se a descrição falhar por
  // instabilidade do ML, o erro sobe e a fila tenta de novo: a IA não responde sem ter lido o anúncio.
  const [{ item, description, extras }, previousQnA, taught] = await Promise.all([
    fetchItemContext(account.id, question.item_id),
    fetchItemAnsweredQuestions(account.id, question.item_id, 10),
    loadTaughtExamples(admin, account.id, question.item_id, question.text),
  ])
  const buyerId = question.from?.id ?? null

  const itemFields: QuestionUpdate = {
    item_title: item.title,
    item_permalink: item.permalink,
    item_thumbnail: item.secure_thumbnail ?? item.thumbnail ?? null,
  }

  return {
    itemFields,
    promptInput: {
      ...assistantBase(account),
      itemSummary: summarizeItem(item, description, extras),
      taughtExamples: taught,
      previousQnA: previousQnA
        .filter((qa) => normalize(qa.question) !== normalize(row.question_text))
        .slice(0, 8)
        .map((qa) => ({ question: qa.question, answer: qa.answer, sameBuyer: buyerId !== null && qa.buyerId === buyerId })),
      question: question.text,
    } satisfies PromptInput,
  }
}

async function isBlacklisted(admin: ServiceClient, accountId: string, itemId: string) {
  const { count, error } = await admin
    .from("item_blacklist")
    .select("id", { count: "exact", head: true })
    .eq("ml_account_id", accountId)
    .eq("item_id", itemId)
  if (error) throw error
  return (count ?? 0) > 0
}

function review(reason: ReviewReason, extra: QuestionUpdate = {}): QuestionUpdate {
  return { status: "needs_review", review_reason: reason, fallback_reason: null, locked_until: null, ...extra }
}

async function handleFailure(admin: ServiceClient, row: QuestionRow, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  console.error(`[answers] pergunta ${row.ml_question_id}:`, message)

  if (error instanceof MlAccountUnavailableError) {
    await save(admin, row.id, review("account_inactive", { last_error: message }))
    return
  }
  if (error instanceof PlatformAiPausedError) {
    await save(admin, row.id, review("auto_reply_off"))
    return
  }
  if (row.attempts >= RETRY_LIMIT) {
    await save(admin, row.id, review("processing_error", { last_error: message }))
    return
  }
  await save(admin, row.id, {
    status: "failed",
    last_error: message,
    locked_until: null,
    next_attempt_at: new Date(Date.now() + retryDelayMs(row.attempts)).toISOString(),
  })
}

/** Processa uma pergunta: decide se a IA responde sozinha ou se fica para o vendedor. */
export async function processQuestion(questionId: string): Promise<void> {
  const admin = createServiceClient()
  const { data: claimed, error: claimError } = await admin.rpc("claim_ml_question", { p_id: questionId })
  if (claimError) throw claimError
  const row = claimed?.[0]
  if (!row) return

  try {
    const account = await loadAccount(admin, row.ml_account_id)
    const question = await fetchQuestion(account.id, row.ml_question_id)

    if (question.status === "UNDER_REVIEW") {
      throw new Error("Pergunta em moderação no Mercado Livre; nova tentativa mais tarde.")
    }
    if (question.status !== "UNANSWERED") {
      await save(admin, row.id, { ...questionFields(question), ...closedOnMercadoLivre(row, question) })
      return
    }

    const base = questionFields(question)
    if (account.status !== "active") {
      await save(admin, row.id, { ...base, ...review("account_inactive") })
      return
    }
    if (!account.organizations || computeAccess(account.organizations).state === "blocked") {
      await save(admin, row.id, { ...base, ...review("access_blocked") })
      return
    }
    if (await isBlacklisted(admin, account.id, question.item_id)) {
      await save(admin, row.id, { ...base, ...review("blacklisted") })
      return
    }

    const { itemFields, promptInput } = await buildPromptContext(admin, account, row, question)
    if (!account.auto_reply_enabled) {
      await save(admin, row.id, { ...base, ...itemFields, ...review("auto_reply_off") })
      return
    }
    // Limite de respostas automáticas do plano: acabou → fica com o vendedor, sem gastar IA (nada se perde).
    const quota = await answersQuotaFor(admin, row.organization_id, account.organizations)
    if (quota.level === "reached") {
      await save(admin, row.id, { ...base, ...itemFields, ...review("answers_limit") })
      return
    }

    let run: AiRun
    try {
      run = await runAnswerModel(promptInput, {
        feature: "question_answer",
        organizationId: row.organization_id,
        mlAccountId: account.id,
        questionId: row.id,
      })
    } catch (error) {
      // Pausa geral da IA (painel do administrador): a pergunta vai para o vendedor, sem gastar tentativa.
      if (error instanceof PlatformAiPausedError) {
        await save(admin, row.id, { ...base, ...itemFields, ...review("auto_reply_off") })
        return
      }
      throw error
    }
    const aiFields: QuestionUpdate = {
      ai_draft: run.result.answer || null,
      ai_confidence: run.result.confidence,
      ai_reason: run.result.reason.slice(0, 1000),
      ai_model: run.model,
      ai_tokens: run.tokens,
    }

    const decision = decideAnswer(run.result, {
      threshold: Number(account.ai_confidence_threshold),
      greeting: account.answer_greeting,
      signature: account.answer_signature,
      mode: parseAnswerMode(account.answer_mode),
      fallback: account.fallback_answer,
    })

    if (decision.kind === "review") {
      await save(admin, row.id, { ...base, ...itemFields, ...aiFields, ...review(decision.reason) })
      return
    }

    // Modo "responder sempre": fallback_reason marca que foi a mensagem padrão (o rascunho da IA fica guardado).
    await save(admin, row.id, {
      ...base,
      ...itemFields,
      ...aiFields,
      answer_text: decision.text,
      answer_source: "ai",
      fallback_reason: decision.fallbackReason,
    })
    await postAnswer(account.id, row.ml_question_id, decision.text)
    await save(admin, row.id, {
      status: "answered",
      answered_at: new Date().toISOString(),
      review_reason: null,
      last_error: null,
      locked_until: null,
    })
  } catch (error) {
    await handleFailure(admin, row, error)
  }
}

/** Reprocessa perguntas pendentes, com nova tentativa vencida ou presas em processamento. */
export async function processDueQuestions(limit = 10): Promise<number> {
  const admin = createServiceClient()
  const { data, error } = await admin.rpc("due_ml_questions", { p_limit: limit })
  if (error) throw error
  for (const id of data ?? []) {
    await processQuestion(id)
  }
  return data?.length ?? 0
}

/** Confere no ML se uma pergunta em revisão já foi respondida/apagada fora da plataforma. */
export async function reconcileQuestion(questionId: string): Promise<void> {
  const admin = createServiceClient()
  const { data: row, error } = await admin.from("ml_questions").select("*").eq("id", questionId).single()
  if (error) throw error
  if (!["needs_review", "failed"].includes(row.status)) return
  try {
    const question = await fetchQuestion(row.ml_account_id, row.ml_question_id)
    if (question.status !== "UNANSWERED" && question.status !== "UNDER_REVIEW") {
      await save(admin, row.id, { ...questionFields(question), ...closedOnMercadoLivre(row, question) })
    }
  } catch (reconcileError) {
    console.error("[answers] reconcile:", reconcileError instanceof Error ? reconcileError.message : reconcileError)
  }
}

export type SuggestionResult = { draft: string; confidence: number; reason: string; composed: string }

/** Gera uma sugestão da IA para o vendedor revisar (não envia nada ao ML). */
export async function suggestAnswer(questionId: string): Promise<SuggestionResult> {
  const admin = createServiceClient()
  const { data: row, error } = await admin.from("ml_questions").select("*").eq("id", questionId).single()
  if (error) throw error
  const account = await loadAccount(admin, row.ml_account_id)
  const question = await fetchQuestion(account.id, row.ml_question_id)
  if (question.status !== "UNANSWERED") {
    await save(admin, row.id, { ...questionFields(question), ...closedOnMercadoLivre(row, question) })
    throw new QuestionClosedError()
  }

  const { itemFields, promptInput } = await buildPromptContext(admin, account, row, question)
  // Sugestão é revisada pelo vendedor: usa sempre as regras do modo cuidadoso (rascunho em vez de resposta neutra).
  const run = await runAnswerModel(
    { ...promptInput, mode: "careful" },
    { feature: "question_suggestion", organizationId: row.organization_id, mlAccountId: account.id, questionId: row.id }
  )
  await save(admin, row.id, {
    ...questionFields(question),
    ...itemFields,
    ai_draft: run.result.answer || null,
    ai_confidence: run.result.confidence,
    ai_reason: run.result.reason.slice(0, 1000),
    ai_model: run.model,
    ai_tokens: run.tokens,
  })

  return {
    draft: run.result.answer,
    confidence: run.result.confidence,
    reason: run.result.reason,
    composed: run.result.answer
      ? composeAnswer({ greeting: account.answer_greeting, body: run.result.answer, signature: account.answer_signature })
      : "",
  }
}

export class QuestionClosedError extends Error {
  constructor() {
    super("Essa pergunta não está mais pendente no Mercado Livre.")
    this.name = "QuestionClosedError"
  }
}

/** Envia uma resposta escrita pelo vendedor. */
export async function sendManualAnswer(questionId: string, text: string, userId: string): Promise<void> {
  const admin = createServiceClient()
  const { data: row, error } = await admin.from("ml_questions").select("*").eq("id", questionId).single()
  if (error) throw error

  try {
    await postAnswer(row.ml_account_id, row.ml_question_id, text)
  } catch (postError) {
    if (postError instanceof MlApiError && postError.status >= 400 && postError.status < 500) {
      const question = await fetchQuestion(row.ml_account_id, row.ml_question_id).catch(() => null)
      if (question && question.status !== "UNANSWERED") {
        await save(admin, row.id, { ...questionFields(question), ...closedOnMercadoLivre(row, question) })
        throw new QuestionClosedError()
      }
    }
    throw postError
  }

  await save(admin, row.id, {
    status: "answered",
    answer_text: text,
    answer_source: "manual",
    fallback_reason: null,
    answered_by: userId,
    answered_at: new Date().toISOString(),
    review_reason: null,
    last_error: null,
    locked_until: null,
  })
}
