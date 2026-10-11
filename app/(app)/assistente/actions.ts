"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  STORE_PROFILE_MAX_BYTES,
  parseStoreProfile,
  profileSize,
  validateAnswer,
  withAnswer,
} from "@/lib/assistant/profile"
import { SETUP_STEP_COUNT, findQuestion } from "@/lib/assistant/questions"
import { runAnswerModel } from "@/lib/answers/ai"
import { ML_ANSWER_LIMIT, composeAnswer, containsExternalContact, parseItemId } from "@/lib/answers/compose"
import { assistantBase, loadTaughtExamples } from "@/lib/answers/context"
import {
  ANSWER_MODES,
  CONFIDENCE_PRESETS,
  DEFAULT_FALLBACK_ANSWER,
  FALLBACK_ANSWER_LIMIT,
  FALLBACK_REASON_LABELS,
  REVIEW_REASON_LABELS,
  TONE_OPTIONS,
  decideAnswer,
  parseAnswerMode,
} from "@/lib/answers/decision"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { summarizeItem } from "@/lib/mercadolivre/item"
import { fetchItem, fetchItemAnsweredQuestions, fetchItemContext } from "@/lib/mercadolivre/questions"
import { createServiceClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"
import { formValues, type FormState } from "@/lib/validation/forms"

export type SimpleResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
const NO_PERMISSION = "Só o dono ou um administrador pode alterar o assistente de IA."
const SAVE_ERROR = "Não foi possível salvar agora. Tente novamente."

const toneValues = TONE_OPTIONS.map((option) => option.value) as [string, ...string[]]
const thresholdValues = CONFIDENCE_PRESETS.map((preset) => preset.value) as [string, ...string[]]

async function loadAccount(accountId: unknown, { manage }: { manage: boolean }) {
  const context = await requireSection("assistente")
  if (manage && !canManageOrganization(context.role)) return { error: NO_PERMISSION } as const
  const parsed = uuid.safeParse(accountId)
  if (!parsed.success) return { error: "Conta não encontrada." } as const
  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select(
      "id, organization_id, ml_user_id, nickname, status, auto_reply_enabled, ai_confidence_threshold, answer_tone, answer_mode, fallback_answer, answer_greeting, answer_signature, store_briefing, store_profile, store_setup_step, store_profile_completed_at, organizations(name)"
    )
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .neq("status", "disconnected")
    .maybeSingle()
  if (error) throw error
  if (!account) return { error: "Conta não encontrada." } as const
  return { context, admin, account } as const
}

type LoadedAccount = Extract<Awaited<ReturnType<typeof loadAccount>>, { account: unknown }>["account"]

function refresh() {
  revalidatePath("/", "layout")
}

/** Confere um anúncio informado pelo vendedor (código ou link) e devolve o título. */
async function resolveItem(account: LoadedAccount, reference: string) {
  const itemId = parseItemId(reference)
  if (!itemId) return { ok: false, message: "Cole o código (ex.: MLB1234567890) ou o link do anúncio." } as const
  try {
    const item = await fetchItem(account.id, itemId)
    if (item.seller_id !== undefined && item.seller_id !== account.ml_user_id) {
      return { ok: false, message: "Esse anúncio não é desta conta do Mercado Livre." } as const
    }
    return { ok: true, itemId, item } as const
  } catch (error) {
    if (error instanceof MlApiError && error.status === 404) {
      return { ok: false, message: "Não encontramos esse anúncio no Mercado Livre." } as const
    }
    if (error instanceof MlAccountUnavailableError) return { ok: false, message: error.message } as const
    return { ok: false, message: "Não foi possível consultar o anúncio agora. Tente de novo." } as const
  }
}

// ---------------------------------------------------------------- ligar / pausar

export async function setAutoReply(accountId: string, enabled: boolean): Promise<SimpleResult> {
  const loaded = await loadAccount(accountId, { manage: true })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (enabled && loaded.account.status !== "active") {
    return { ok: false, message: "Ative ou reconecte a conta antes de ligar as respostas automáticas." }
  }
  if (enabled && !loaded.account.store_profile_completed_at) {
    return { ok: false, message: "Conclua a configuração do assistente antes de ligar as respostas automáticas." }
  }
  const { error } = await loaded.admin
    .from("ml_accounts")
    .update({ auto_reply_enabled: enabled })
    .eq("id", loaded.account.id)
  if (error) throw error
  refresh()
  return {
    ok: true,
    message: enabled
      ? "IA ligada. As próximas perguntas já serão analisadas por ela."
      : "IA pausada. Todas as perguntas ficam para você responder.",
  }
}

// ---------------------------------------------------------------- configuração guiada

const NO_CONTACT = "Não use telefone, e-mail, link ou rede social: o Mercado Livre proíbe contato externo nas respostas."
const affix = z
  .string()
  .trim()
  .max(200, "Use no máximo 200 caracteres.")
  .refine((value) => !containsExternalContact(value), NO_CONTACT)

const styleSchema = z.object({
  tone: z.enum(toneValues, { errorMap: () => ({ message: "Escolha um tom." }) }),
  greeting: affix,
  signature: affix,
  threshold: z.enum(thresholdValues, { errorMap: () => ({ message: "Escolha um nível de cuidado." }) }),
  mode: z.enum(ANSWER_MODES as unknown as [string, ...string[]]).default("careful"),
  fallback: z
    .string()
    .trim()
    .max(FALLBACK_ANSWER_LIMIT, "Use no máximo 1.000 caracteres.")
    .refine((value) => !containsExternalContact(value), NO_CONTACT)
    .default(""),
})

/** Campos de ml_accounts que guardam o jeito de responder (a mensagem igual à do sistema fica vazia = segue o padrão). */
function styleColumns(style: z.infer<typeof styleSchema>) {
  const fallback = style.fallback.replace(/\s+/g, " ").trim()
  return {
    answer_tone: style.tone,
    answer_greeting: style.greeting.replace(/\s+/g, " "),
    answer_signature: style.signature.replace(/\s+/g, " "),
    ai_confidence_threshold: Number(style.threshold),
    answer_mode: parseAnswerMode(style.mode),
    fallback_answer: fallback === DEFAULT_FALLBACK_ANSWER ? "" : fallback,
  }
}

export type SetupStepInput = {
  accountId: string
  stepId: string
  nextStep: number
  complete?: boolean
  options?: string[]
  text?: string
  style?: { tone: string; greeting: string; signature: string; threshold: string; mode: string; fallback: string }
}

async function saveQuestion(loaded: Exclude<Awaited<ReturnType<typeof loadAccount>>, { error: string }>, questionId: string, input: { options?: unknown; text?: unknown }) {
  const question = findQuestion(questionId)
  if (!question) return { ok: false, message: "Pergunta não encontrada." } as const
  const validation = validateAnswer(question, input)
  if (!validation.ok) return { ok: false, message: validation.message } as const
  const profile = withAnswer(parseStoreProfile(loaded.account.store_profile), question.id, validation.answer)
  if (profileSize(profile) > STORE_PROFILE_MAX_BYTES) {
    return { ok: false, message: "As respostas ficaram grandes demais. Resuma alguns textos." } as const
  }
  return { ok: true, profile } as const
}

export async function saveSetupStep(input: SetupStepInput): Promise<SimpleResult> {
  const loaded = await loadAccount(input.accountId, { manage: true })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }

  const nextStep = Math.min(Math.max(Math.trunc(Number(input.nextStep) || 0), 0), SETUP_STEP_COUNT)
  const update: Database["public"]["Tables"]["ml_accounts"]["Update"] = { store_setup_step: nextStep }

  if (input.style) {
    const parsed = styleSchema.safeParse(input.style)
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Confira os campos." }
    Object.assign(update, styleColumns(parsed.data))
  } else if (input.stepId) {
    const saved = await saveQuestion(loaded, input.stepId, input)
    if (!saved.ok) return saved
    update.store_profile = saved.profile
  }

  if (input.complete) {
    const profile = parseStoreProfile(update.store_profile ?? loaded.account.store_profile)
    if (!profile.store_name) return { ok: false, message: "Volte ao início e informe o nome da loja." }
    update.store_profile_completed_at = loaded.account.store_profile_completed_at ?? new Date().toISOString()
  }

  const { error } = await loaded.admin.from("ml_accounts").update(update).eq("id", loaded.account.id)
  if (error) return { ok: false, message: SAVE_ERROR }
  if (input.complete) refresh()
  return { ok: true, message: input.complete ? "Assistente configurado." : "Salvo." }
}

/** Edita uma resposta da configuração depois de concluída. */
export async function saveProfileAnswer(
  accountId: string,
  questionId: string,
  value: { options: string[]; text: string }
): Promise<SimpleResult> {
  const loaded = await loadAccount(accountId, { manage: true })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const saved = await saveQuestion(loaded, questionId, value)
  if (!saved.ok) return saved
  const { error } = await loaded.admin.from("ml_accounts").update({ store_profile: saved.profile }).eq("id", loaded.account.id)
  if (error) return { ok: false, message: SAVE_ERROR }
  refresh()
  return { ok: true, message: "Informação atualizada. A IA já usa a nova versão." }
}

/** Usa a configuração de outra conta da mesma loja como ponto de partida. */
export async function copySetupFrom(targetAccountId: string, sourceAccountId: string): Promise<SimpleResult> {
  const target = await loadAccount(targetAccountId, { manage: true })
  if ("error" in target) return { ok: false, message: target.error ?? "Erro." }
  const source = await loadAccount(sourceAccountId, { manage: true })
  if ("error" in source) return { ok: false, message: source.error ?? "Erro." }
  if (source.account.id === target.account.id) return { ok: false, message: "Escolha outra conta." }

  const { error } = await target.admin
    .from("ml_accounts")
    .update({
      store_profile: parseStoreProfile(source.account.store_profile),
      store_briefing: source.account.store_briefing,
      answer_tone: source.account.answer_tone,
      answer_greeting: source.account.answer_greeting,
      answer_signature: source.account.answer_signature,
      ai_confidence_threshold: source.account.ai_confidence_threshold,
      answer_mode: source.account.answer_mode,
      fallback_answer: source.account.fallback_answer,
      store_setup_step: 0,
    })
    .eq("id", target.account.id)
  if (error) return { ok: false, message: SAVE_ERROR }
  refresh()
  return { ok: true, message: "Respostas copiadas. Revise cada passo e conclua." }
}

// ---------------------------------------------------------------- estilo e outras informações

export async function updateStyle(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "tone", "greeting", "signature", "threshold", "mode", "fallback"])
  const parsed = styleSchema.safeParse({
    tone: formData.get("tone"),
    greeting: formData.get("greeting") ?? "",
    signature: formData.get("signature") ?? "",
    threshold: formData.get("threshold"),
    mode: formData.get("mode") ?? undefined,
    fallback: formData.get("fallback") ?? undefined,
  })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }

  const { error } = await loaded.admin.from("ml_accounts").update(styleColumns(parsed.data)).eq("id", loaded.account.id)
  if (error) return { message: SAVE_ERROR, values }
  refresh()
  return { ok: true, message: "Jeito de responder salvo.", values }
}

export async function updateExtraInfo(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "briefing"])
  const briefing = String(formData.get("briefing") ?? "").replace(/\r\n/g, "\n").trim()
  if (briefing.length > 5000) return { fieldErrors: { briefing: ["Use no máximo 5.000 caracteres."] }, values }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }
  const { error } = await loaded.admin.from("ml_accounts").update({ store_briefing: briefing }).eq("id", loaded.account.id)
  if (error) return { message: SAVE_ERROR, values }
  refresh()
  return { ok: true, message: "Informações salvas.", values: { accountId: loaded.account.id, briefing } }
}

// ---------------------------------------------------------------- anúncios bloqueados

export async function addBlacklistItem(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "item"])
  if (!parseItemId(String(formData.get("item") ?? ""))) {
    return { fieldErrors: { item: ["Cole o código (ex.: MLB1234567890) ou o link do anúncio."] }, values }
  }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }

  const resolved = await resolveItem(loaded.account, String(formData.get("item")))
  if (!resolved.ok) return { fieldErrors: { item: [resolved.message] }, values }

  const { error } = await loaded.admin.from("item_blacklist").insert({
    organization_id: loaded.account.organization_id,
    ml_account_id: loaded.account.id,
    item_id: resolved.itemId,
    item_title: resolved.item.title,
    created_by: loaded.context.user.id,
  })
  if (error) {
    if (error.code === "23505") return { fieldErrors: { item: ["Esse anúncio já está na lista."] }, values }
    return { message: SAVE_ERROR, values }
  }
  refresh()
  return {
    ok: true,
    message: `"${resolved.item.title}" bloqueado. Perguntas dele vão direto para você.`,
    values: { accountId: loaded.account.id },
  }
}

export async function removeBlacklistItem(id: string): Promise<SimpleResult> {
  const context = await requireSection("assistente")
  if (!canManageOrganization(context.role)) return { ok: false, message: NO_PERMISSION }
  if (!uuid.safeParse(id).success) return { ok: false, message: "Item não encontrado." }
  const { error } = await createServiceClient()
    .from("item_blacklist")
    .delete()
    .eq("id", id)
    .eq("organization_id", context.organization.id)
  if (error) throw error
  refresh()
  return { ok: true, message: "Anúncio desbloqueado. A IA volta a responder perguntas dele." }
}

// ---------------------------------------------------------------- respostas ensinadas

const exampleSchema = z.object({
  question: z.string().trim().min(3, "Escreva a pergunta.").max(2000, "Pergunta muito longa."),
  answer: z.string().trim().min(2, "Escreva a resposta.").max(2000, "Resposta muito longa."),
})

export async function addExample(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "question", "answer", "scope", "item"])
  const parsed = exampleSchema.safeParse({ question: formData.get("question"), answer: formData.get("answer") })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }

  let itemId: string | null = null
  let itemTitle: string | null = null
  if (formData.get("scope") === "item") {
    const resolved = await resolveItem(loaded.account, String(formData.get("item") ?? ""))
    if (!resolved.ok) return { fieldErrors: { item: [resolved.message] }, values }
    itemId = resolved.itemId
    itemTitle = resolved.item.title.slice(0, 300)
  }

  const { error } = await loaded.admin.from("ai_examples").insert({
    organization_id: loaded.account.organization_id,
    ml_account_id: loaded.account.id,
    item_id: itemId,
    item_title: itemTitle,
    question_text: parsed.data.question,
    answer_text: parsed.data.answer.replace(/\s+/g, " "),
    created_by: loaded.context.user.id,
  })
  if (error) return { message: SAVE_ERROR, values }
  refresh()
  return {
    ok: true,
    message: "Resposta ensinada. A IA vai usá-la em perguntas parecidas.",
    values: { accountId: loaded.account.id },
  }
}

export async function updateExample(id: string, question: string, answer: string): Promise<SimpleResult> {
  const context = await requireSection("assistente")
  if (!canManageOrganization(context.role)) return { ok: false, message: NO_PERMISSION }
  if (!uuid.safeParse(id).success) return { ok: false, message: "Resposta não encontrada." }
  const parsed = exampleSchema.safeParse({ question, answer })
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Confira os campos." }
  const { data, error } = await createServiceClient()
    .from("ai_examples")
    .update({ question_text: parsed.data.question, answer_text: parsed.data.answer.replace(/\s+/g, " ") })
    .eq("id", id)
    .eq("organization_id", context.organization.id)
    .select("id")
  if (error) return { ok: false, message: SAVE_ERROR }
  if (!data?.length) return { ok: false, message: "Resposta não encontrada." }
  refresh()
  return { ok: true, message: "Resposta ensinada atualizada." }
}

export async function deleteExample(id: string): Promise<SimpleResult> {
  const context = await requireSection("assistente")
  if (!canManageOrganization(context.role)) return { ok: false, message: NO_PERMISSION }
  if (!uuid.safeParse(id).success) return { ok: false, message: "Item não encontrado." }
  const { error } = await createServiceClient()
    .from("ai_examples")
    .delete()
    .eq("id", id)
    .eq("organization_id", context.organization.id)
  if (error) throw error
  refresh()
  return { ok: true, message: "Resposta ensinada removida." }
}

// ---------------------------------------------------------------- testar a IA

export type TestResult =
  | {
      ok: true
      /** answer = a IA responderia com o texto dela; fallback = mandaria a mensagem padrão; review = ficaria para você. */
      outcome: "answer" | "fallback" | "review"
      text: string
      confidence: number
      reason: string
      /** Por que não saiu a resposta da IA (revisão ou mensagem padrão). */
      outcomeLabel: string | null
      /** Rascunho da IA quando a mensagem padrão foi usada no lugar dele. */
      draft: string | null
      itemTitle: string | null
      /** Exatamente o que a IA leu do anúncio (null quando o teste foi sem anúncio). */
      itemSummary: string | null
      mode: "careful" | "always"
    }
  | { ok: false; message: string }

/** Simula a resposta da IA com a configuração atual. Não envia nada ao Mercado Livre. */
export async function testAssistant(accountId: string, rawQuestion: string, itemReference: string): Promise<TestResult> {
  const loaded = await loadAccount(accountId, { manage: false })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const question = rawQuestion.replace(/\s+/g, " ").trim()
  if (question.length < 3) return { ok: false, message: "Escreva a pergunta do comprador." }
  if (question.length > 1000) return { ok: false, message: "Pergunta muito longa (máximo de 1.000 caracteres)." }

  const { account, admin } = loaded
  const mode = parseAnswerMode(account.answer_mode)
  let itemSummary = [
    "Teste sem anúncio: o vendedor está testando a IA sem escolher um anúncio.",
    "Responda normalmente as perguntas sobre a loja (envio, retirada, nota fiscal, garantia, trocas, pagamento, atendimento) usando o CONHECIMENTO_DA_LOJA e as respostas ensinadas.",
    "Só use escalate por falta de anúncio quando a pergunta depender de um produto específico (características, estoque, variações ou preço).",
  ].join("\n")
  let itemId: string | null = null
  let itemTitle: string | null = null
  let readSummary: string | null = null
  let previousQnA: { question: string; answer: string }[] = []

  if (itemReference.trim()) {
    const resolved = await resolveItem(account, itemReference)
    if (!resolved.ok) return resolved
    itemId = resolved.itemId
    itemTitle = resolved.item.title
    try {
      const [context, answered] = await Promise.all([
        fetchItemContext(account.id, itemId, resolved.item),
        fetchItemAnsweredQuestions(account.id, itemId, 8),
      ])
      itemSummary = summarizeItem(context.item, context.description, context.extras)
      readSummary = itemSummary
      previousQnA = answered.map((qa) => ({ question: qa.question, answer: qa.answer }))
    } catch (error) {
      console.error("[assistente] teste (anúncio):", error instanceof Error ? error.message : error)
      return { ok: false, message: "Não foi possível ler a descrição do anúncio agora. Tente de novo em instantes." }
    }
  }

  try {
    const taught = await loadTaughtExamples(admin, account.id, itemId, question)
    const run = await runAnswerModel({
      ...assistantBase(account),
      itemSummary,
      taughtExamples: taught,
      previousQnA,
      question,
    })
    const settings = {
      threshold: Number(account.ai_confidence_threshold),
      greeting: account.answer_greeting,
      signature: account.answer_signature,
      mode,
      fallback: account.fallback_answer,
    }
    const decision = decideAnswer(run.result, settings)
    const draft = run.result.answer
      ? composeAnswer({ greeting: account.answer_greeting, body: run.result.answer, signature: account.answer_signature })
      : ""
    const base = { ok: true as const, confidence: run.result.confidence, reason: run.result.reason, itemTitle, itemSummary: readSummary, mode }

    if (decision.kind === "review") {
      return { ...base, outcome: "review", text: draft.slice(0, ML_ANSWER_LIMIT + 200), outcomeLabel: REVIEW_REASON_LABELS[decision.reason], draft: null }
    }
    if (decision.fallbackReason) {
      return {
        ...base,
        outcome: "fallback",
        text: decision.text,
        outcomeLabel: FALLBACK_REASON_LABELS[decision.fallbackReason],
        draft: draft ? draft.slice(0, ML_ANSWER_LIMIT + 200) : null,
      }
    }
    return { ...base, outcome: "answer", text: decision.text, outcomeLabel: null, draft: null }
  } catch (error) {
    console.error("[assistente] teste:", error instanceof Error ? error.message : error)
    return { ok: false, message: "A IA não respondeu agora. Tente de novo em instantes." }
  }
}