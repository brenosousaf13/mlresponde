"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { z } from "zod"

import {
  QuestionClosedError,
  processQuestion,
  reconcileQuestion,
  sendManualAnswer,
  suggestAnswer,
} from "@/lib/answers/engine"
import { syncUnansweredQuestions } from "@/lib/answers/ingest"
import { ML_ANSWER_LIMIT, containsExternalContact, stripAffixes } from "@/lib/answers/compose"
import { requireSection } from "@/lib/dal/app-context"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { createServiceClient } from "@/lib/supabase/admin"

export type QuestionActionResult = { ok: boolean; message: string }

const idSchema = z.string().uuid()
const OPEN_STATUSES = ["needs_review", "failed"]

async function loadQuestion(id: string) {
  const context = await requireSection("perguntas")
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { error: "Pergunta não encontrada." } as const
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("ml_questions")
    .select("id, status, ml_account_id, item_id, item_title, question_text, answer_source, fallback_reason, ml_accounts(answer_greeting, answer_signature)")
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { error: "Pergunta não encontrada." } as const
  return { context, admin, question: data } as const
}

function friendlyError(error: unknown): string {
  if (error instanceof QuestionClosedError) return "Essa pergunta já foi respondida ou removida no Mercado Livre."
  if (error instanceof MlAccountUnavailableError) return error.message
  if (error instanceof MlApiError) return "O Mercado Livre recusou a operação. Tente de novo em instantes."
  return "Algo deu errado. Tente novamente."
}

export async function answerQuestion(id: string, rawText: string, teach: boolean): Promise<QuestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const { context, admin, question } = loaded

  const text = rawText.replace(/\s+/g, " ").trim()
  if (!text) return { ok: false, message: "Escreva a resposta antes de enviar." }
  if (text.length > ML_ANSWER_LIMIT) {
    return { ok: false, message: `A resposta pode ter no máximo ${ML_ANSWER_LIMIT} caracteres.` }
  }
  if (question.status === "processing" || question.status === "pending") {
    return { ok: false, message: "A IA está analisando essa pergunta agora. Tente de novo em alguns segundos." }
  }
  if (!OPEN_STATUSES.includes(question.status)) {
    return { ok: false, message: "Essa pergunta já foi resolvida." }
  }

  try {
    await sendManualAnswer(question.id, text, context.user.id)
  } catch (error) {
    revalidatePath("/perguntas")
    return { ok: false, message: friendlyError(error) }
  }

  if (teach && question.question_text) {
    const answerBody = stripAffixes(
      text,
      question.ml_accounts?.answer_greeting ?? "",
      question.ml_accounts?.answer_signature ?? ""
    )
    if (answerBody) {
      await admin.from("ai_examples").insert({
        organization_id: context.organization.id,
        ml_account_id: question.ml_account_id,
        item_id: question.item_id,
        question_text: question.question_text.slice(0, 2000),
        answer_text: answerBody.slice(0, 2000),
        source_question_id: question.id,
        created_by: context.user.id,
      })
    }
  }

  revalidatePath("/", "layout")
  return { ok: true, message: teach ? "Resposta enviada e ensinada para a IA." : "Resposta enviada ao comprador." }
}

/**
 * Ensina a resposta certa para uma pergunta que recebeu a mensagem padrão (modo "responder sempre").
 * O comprador já foi respondido no ML; a resposta ensinada vale para as próximas perguntas parecidas.
 */
export async function teachFromQuestion(id: string, rawAnswer: string, allItems: boolean): Promise<QuestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const { context, admin, question } = loaded

  if (question.status !== "answered" || question.answer_source !== "ai" || !question.fallback_reason) {
    return { ok: false, message: "Só dá para ensinar por aqui as perguntas respondidas com a mensagem padrão." }
  }
  if (!question.question_text) return { ok: false, message: "A pergunta ainda não foi carregada do Mercado Livre." }

  const answer = stripAffixes(
    rawAnswer,
    question.ml_accounts?.answer_greeting ?? "",
    question.ml_accounts?.answer_signature ?? ""
  )
  if (answer.length < 2) return { ok: false, message: "Escreva a resposta que a IA deve usar." }
  if (answer.length > 2000) return { ok: false, message: "Resposta muito longa (máximo de 2.000 caracteres)." }
  if (containsExternalContact(answer)) {
    return { ok: false, message: "Não use telefone, e-mail, link ou rede social: o Mercado Livre proíbe contato externo." }
  }

  const itemId = allItems ? null : question.item_id
  const values = {
    item_id: itemId,
    item_title: itemId ? (question.item_title?.slice(0, 300) ?? null) : null,
    question_text: question.question_text.slice(0, 2000),
    answer_text: answer,
  }
  const { data: existing, error: findError } = await admin
    .from("ai_examples")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("source_question_id", question.id)
    .limit(1)
    .maybeSingle()
  if (findError) throw findError

  const { error } = existing
    ? await admin.from("ai_examples").update(values).eq("id", existing.id)
    : await admin.from("ai_examples").insert({
        ...values,
        organization_id: context.organization.id,
        ml_account_id: question.ml_account_id,
        source_question_id: question.id,
        created_by: context.user.id,
      })
  if (error) return { ok: false, message: "Não foi possível salvar agora. Tente novamente." }

  revalidatePath("/", "layout")
  return {
    ok: true,
    message: allItems
      ? "Ensinado. A IA vai usar essa resposta em perguntas parecidas de todos os anúncios."
      : "Ensinado. A IA vai usar essa resposta em perguntas parecidas deste anúncio.",
  }
}

export type SuggestionActionResult =
  | { ok: true; composed: string; confidence: number; reason: string }
  | { ok: false; message: string }

export async function generateSuggestion(id: string): Promise<SuggestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (!OPEN_STATUSES.includes(loaded.question.status)) {
    return { ok: false, message: "Essa pergunta não está aguardando resposta." }
  }
  try {
    const suggestion = await suggestAnswer(loaded.question.id)
    revalidatePath("/perguntas")
    if (!suggestion.composed) {
      return { ok: false, message: `A IA não encontrou informação suficiente. ${suggestion.reason}`.trim() }
    }
    return { ok: true, composed: suggestion.composed, confidence: suggestion.confidence, reason: suggestion.reason }
  } catch (error) {
    revalidatePath("/perguntas")
    return { ok: false, message: friendlyError(error) }
  }
}

export async function ignoreQuestion(id: string): Promise<QuestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (!OPEN_STATUSES.includes(loaded.question.status)) return { ok: false, message: "Essa pergunta já foi resolvida." }
  const { error } = await loaded.admin
    .from("ml_questions")
    .update({ status: "ignored", review_reason: null })
    .eq("id", loaded.question.id)
  if (error) throw error
  revalidatePath("/", "layout")
  return { ok: true, message: "Pergunta arquivada. Ela continua sem resposta no Mercado Livre." }
}

export async function restoreQuestion(id: string): Promise<QuestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (loaded.question.status !== "ignored") return { ok: false, message: "Essa pergunta não está arquivada." }
  const { error } = await loaded.admin
    .from("ml_questions")
    .update({ status: "needs_review", review_reason: null })
    .eq("id", loaded.question.id)
  if (error) throw error
  const questionId = loaded.question.id
  // Se ela já foi respondida ou apagada no ML enquanto estava arquivada, a reconciliação corrige o status.
  after(() => reconcileQuestion(questionId))
  revalidatePath("/", "layout")
  return { ok: true, message: "Pergunta de volta em \"Para responder\"." }
}

export async function retryWithAi(id: string): Promise<QuestionActionResult> {
  const loaded = await loadQuestion(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (!OPEN_STATUSES.includes(loaded.question.status)) return { ok: false, message: "Essa pergunta já foi resolvida." }
  const { error } = await loaded.admin
    .from("ml_questions")
    .update({
      status: "pending",
      review_reason: null,
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      locked_until: null,
      last_error: null,
    })
    .eq("id", loaded.question.id)
  if (error) throw error
  const questionId = loaded.question.id
  after(() => processQuestion(questionId))
  revalidatePath("/", "layout")
  return { ok: true, message: "A IA vai analisar essa pergunta de novo." }
}

export async function syncQuestions(): Promise<QuestionActionResult> {
  const context = await requireSection("perguntas")
  const admin = createServiceClient()
  const { data: accounts, error } = await admin
    .from("ml_accounts")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("status", "active")
  if (error) throw error

  const created: string[] = []
  const failures: string[] = []
  for (const account of accounts ?? []) {
    try {
      const result = await syncUnansweredQuestions(account.id)
      created.push(...result.created)
    } catch (syncError) {
      failures.push(friendlyError(syncError))
    }
  }

  if (created.length) {
    after(async () => {
      for (const questionId of created) await processQuestion(questionId)
    })
  }
  revalidatePath("/", "layout")

  if (failures.length && !created.length) return { ok: false, message: failures[0] }
  return {
    ok: true,
    message: created.length
      ? `${created.length} pergunta${created.length === 1 ? " nova encontrada" : "s novas encontradas"}. A IA já está analisando.`
      : "Tudo em dia: nenhuma pergunta nova sem resposta no Mercado Livre.",
  }
}
