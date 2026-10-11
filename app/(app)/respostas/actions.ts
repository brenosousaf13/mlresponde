"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { parseItemId } from "@/lib/answers/compose"
import { CONFIDENCE_PRESETS, TONE_OPTIONS } from "@/lib/answers/decision"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { fetchItem } from "@/lib/mercadolivre/questions"
import { createServiceClient } from "@/lib/supabase/admin"
import { formValues, type FormState } from "@/lib/validation/forms"

export type SimpleResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
const NO_PERMISSION = "Só o dono ou um administrador pode alterar as respostas da IA."

async function loadManagedAccount(accountId: unknown) {
  const context = await requireSection("respostas")
  if (!canManageOrganization(context.role)) return { error: NO_PERMISSION } as const
  const parsed = uuid.safeParse(accountId)
  if (!parsed.success) return { error: "Conta não encontrada." } as const
  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select("id, organization_id, ml_user_id, status")
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (error) throw error
  if (!account) return { error: "Conta não encontrada." } as const
  return { context, admin, account } as const
}

function refresh() {
  revalidatePath("/", "layout")
}

export async function setAutoReply(accountId: string, enabled: boolean): Promise<SimpleResult> {
  const loaded = await loadManagedAccount(accountId)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (enabled && loaded.account.status !== "active") {
    return { ok: false, message: "Ative ou reconecte a conta antes de ligar as respostas automáticas." }
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
      ? "Respostas automáticas ligadas. As próximas perguntas já serão analisadas pela IA."
      : "Respostas automáticas pausadas. As perguntas ficam para você responder.",
  }
}

const settingsSchema = z.object({
  accountId: uuid,
  threshold: z.enum(CONFIDENCE_PRESETS.map((preset) => preset.value) as [string, ...string[]], {
    errorMap: () => ({ message: "Escolha um nível de cuidado." }),
  }),
  tone: z.enum(TONE_OPTIONS.map((option) => option.value) as [string, ...string[]], {
    errorMap: () => ({ message: "Escolha um tom." }),
  }),
  greeting: z.string().trim().max(200, "Use no máximo 200 caracteres."),
  signature: z.string().trim().max(200, "Use no máximo 200 caracteres."),
  briefing: z.string().trim().max(5000, "Use no máximo 5.000 caracteres."),
})

export async function updateAnswerSettings(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "threshold", "tone", "greeting", "signature", "briefing"])
  const parsed = settingsSchema.safeParse({
    accountId: formData.get("accountId"),
    threshold: formData.get("threshold"),
    tone: formData.get("tone"),
    greeting: formData.get("greeting") ?? "",
    signature: formData.get("signature") ?? "",
    briefing: formData.get("briefing") ?? "",
  })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }

  const loaded = await loadManagedAccount(parsed.data.accountId)
  if ("error" in loaded) return { message: loaded.error, values }

  const { error } = await loaded.admin
    .from("ml_accounts")
    .update({
      ai_confidence_threshold: Number(parsed.data.threshold),
      answer_tone: parsed.data.tone,
      answer_greeting: parsed.data.greeting.replace(/\s+/g, " "),
      answer_signature: parsed.data.signature.replace(/\s+/g, " "),
      store_briefing: parsed.data.briefing,
    })
    .eq("id", loaded.account.id)
  if (error) return { message: "Não foi possível salvar agora. Tente novamente.", values }

  refresh()
  return { ok: true, message: "Configurações salvas.", values }
}

export async function addBlacklistItem(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "item"])
  const itemId = parseItemId(String(formData.get("item") ?? ""))
  if (!itemId) {
    return { fieldErrors: { item: ["Cole o código (ex.: MLB1234567890) ou o link do anúncio."] }, values }
  }
  const loaded = await loadManagedAccount(formData.get("accountId"))
  if ("error" in loaded) return { message: loaded.error, values }

  let title: string
  try {
    const item = await fetchItem(loaded.account.id, itemId)
    if (item.seller_id !== undefined && item.seller_id !== loaded.account.ml_user_id) {
      return { fieldErrors: { item: ["Esse anúncio não é desta conta do Mercado Livre."] }, values }
    }
    title = item.title
  } catch (error) {
    if (error instanceof MlApiError && error.status === 404) {
      return { fieldErrors: { item: ["Não encontramos esse anúncio no Mercado Livre."] }, values }
    }
    if (error instanceof MlAccountUnavailableError) return { message: error.message, values }
    return { message: "Não foi possível consultar o anúncio agora. Tente de novo.", values }
  }

  const { error } = await loaded.admin.from("item_blacklist").insert({
    organization_id: loaded.account.organization_id,
    ml_account_id: loaded.account.id,
    item_id: itemId,
    item_title: title,
    created_by: loaded.context.user.id,
  })
  if (error) {
    if (error.code === "23505") return { fieldErrors: { item: ["Esse anúncio já está na lista."] }, values }
    return { message: "Não foi possível salvar agora. Tente novamente.", values }
  }

  refresh()
  return { ok: true, message: `"${title}" adicionado. A IA não vai responder perguntas dele.`, values: { accountId: loaded.account.id } }
}

export async function removeBlacklistItem(id: string): Promise<SimpleResult> {
  const context = await requireSection("respostas")
  if (!canManageOrganization(context.role)) return { ok: false, message: NO_PERMISSION }
  if (!uuid.safeParse(id).success) return { ok: false, message: "Item não encontrado." }
  const { error } = await createServiceClient()
    .from("item_blacklist")
    .delete()
    .eq("id", id)
    .eq("organization_id", context.organization.id)
  if (error) throw error
  refresh()
  return { ok: true, message: "Anúncio removido da lista. A IA volta a responder perguntas dele." }
}

const exampleSchema = z.object({
  accountId: uuid,
  question: z.string().trim().min(3, "Escreva a pergunta.").max(2000, "Pergunta muito longa."),
  answer: z.string().trim().min(2, "Escreva a resposta.").max(2000, "Resposta muito longa."),
})

export async function addExample(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "question", "answer"])
  const parsed = exampleSchema.safeParse({
    accountId: formData.get("accountId"),
    question: formData.get("question"),
    answer: formData.get("answer"),
  })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  const loaded = await loadManagedAccount(parsed.data.accountId)
  if ("error" in loaded) return { message: loaded.error, values }

  const { error } = await loaded.admin.from("ai_examples").insert({
    organization_id: loaded.account.organization_id,
    ml_account_id: loaded.account.id,
    item_id: null,
    question_text: parsed.data.question,
    answer_text: parsed.data.answer.replace(/\s+/g, " "),
    created_by: loaded.context.user.id,
  })
  if (error) return { message: "Não foi possível salvar agora. Tente novamente.", values }
  refresh()
  return { ok: true, message: "Resposta ensinada. A IA vai usá-la em perguntas parecidas.", values: { accountId: loaded.account.id } }
}

export async function deleteExample(id: string): Promise<SimpleResult> {
  const context = await requireSection("respostas")
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
