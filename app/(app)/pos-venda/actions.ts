"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { z } from "zod"

import {
  AFTER_SALE_CONFIDENCE_PRESETS,
  AFTER_SALE_REVIEW_LABELS,
  SENSITIVE_POLICIES,
  TOPIC_LABELS,
} from "@/lib/after-sale/decision"
import {
  ConversationUnavailableError,
  processConversation,
  refreshConversation,
  sendManualReply,
  suggestReply,
  syncUnreadConversations,
  testAgent,
} from "@/lib/after-sale/engine"
import { AFTER_SALE_INSTRUCTIONS_LIMIT, AFTER_SALE_SIGNATURE_LIMIT, toMlMessageText } from "@/lib/after-sale/text"
import { PlatformAiPausedError } from "@/lib/ai/usage"
import { containsExternalContact } from "@/lib/answers/compose"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { createServiceClient } from "@/lib/supabase/admin"
import { formValues, type FormState } from "@/lib/validation/forms"

export type ActionResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
const NO_PERMISSION = "Só o dono ou um administrador pode alterar o agente de pós-venda."
const SAVE_ERROR = "Não foi possível salvar agora. Tente novamente."
const NO_CONTACT = "Não use telefone, e-mail, link ou rede social: o Mercado Livre bloqueia mensagens com contato externo."

/** Anexos aceitos pelo ML: JPG, PNG, PDF e TXT. O total fica abaixo do limite de envio da Vercel. */
const ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
  "text/plain": "txt",
}
const ATTACHMENT_EXTENSIONS = /\.(jpe?g|png|pdf|txt)$/i
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENTS_BYTES = 4 * 1024 * 1024

function friendlyError(error: unknown): string {
  if (error instanceof ConversationUnavailableError) return error.message
  if (error instanceof PlatformAiPausedError) return error.message
  if (error instanceof MlAccountUnavailableError) return error.message
  if (error instanceof MlApiError) return "O Mercado Livre não respondeu como esperado. Tente de novo em instantes."
  return "Algo deu errado. Tente novamente."
}

function refresh() {
  revalidatePath("/", "layout")
}

async function loadConversation(id: unknown) {
  const context = await requireSection("pos_venda")
  const parsed = uuid.safeParse(id)
  if (!parsed.success) return { error: "Conversa não encontrada." } as const
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("ml_conversations")
    .select("id, status, locked_until, ml_account_id")
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { error: "Conversa não encontrada." } as const
  return { context, admin, conversation: data } as const
}

function busy(conversation: { status: string; locked_until: string | null }) {
  return (
    conversation.status === "pending" ||
    (conversation.status === "processing" && Boolean(conversation.locked_until) && new Date(conversation.locked_until!) > new Date())
  )
}

// ---------------------------------------------------------------- conversa

export async function sendReply(formData: FormData): Promise<ActionResult> {
  const loaded = await loadConversation(formData.get("conversationId"))
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }

  const text = toMlMessageText(String(formData.get("text") ?? ""))
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0)
  if (!text && !files.length) return { ok: false, message: "Escreva a mensagem ou anexe um arquivo." }
  if (containsExternalContact(text)) return { ok: false, message: NO_CONTACT }
  if (files.length > MAX_ATTACHMENTS) return { ok: false, message: `Anexe no máximo ${MAX_ATTACHMENTS} arquivos por mensagem.` }
  if (files.some((file) => !ATTACHMENT_TYPES[file.type] && !ATTACHMENT_EXTENSIONS.test(file.name))) {
    return { ok: false, message: "Formatos aceitos pelo Mercado Livre: JPG, PNG, PDF e TXT." }
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENTS_BYTES) {
    return { ok: false, message: "Os anexos podem somar no máximo 4 MB por mensagem." }
  }
  if (files.some((file) => file.name.length > 200 || /[\\/]/.test(file.name))) {
    return { ok: false, message: "Renomeie o arquivo: o nome não pode ter barras nem passar de 200 caracteres." }
  }

  try {
    await sendManualReply({
      conversationId: loaded.conversation.id,
      text,
      userId: loaded.context.user.id,
      files,
      teach: formData.get("teach") === "on",
    })
  } catch (error) {
    refresh()
    return { ok: false, message: friendlyError(error) }
  }
  refresh()
  return {
    ok: true,
    message: formData.get("teach") === "on" ? "Mensagem enviada e ensinada ao agente." : "Mensagem enviada ao comprador.",
  }
}

export type SuggestionResult =
  | { ok: true; composed: string; confidence: number; reason: string; topic: string }
  | { ok: false; message: string }

export async function generateSuggestion(id: string): Promise<SuggestionResult> {
  const loaded = await loadConversation(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  try {
    const suggestion = await suggestReply(loaded.conversation.id)
    refresh()
    if (!suggestion.composed) return { ok: false, message: `O agente não encontrou informação suficiente. ${suggestion.reason}`.trim() }
    const topic = TOPIC_LABELS[suggestion.topic as keyof typeof TOPIC_LABELS] ?? suggestion.topic
    return { ok: true, composed: suggestion.composed, confidence: suggestion.confidence, reason: suggestion.reason, topic }
  } catch (error) {
    return { ok: false, message: friendlyError(error) }
  }
}

export async function refreshFromMl(id: string): Promise<ActionResult> {
  const loaded = await loadConversation(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  try {
    const result = await refreshConversation(loaded.conversation.id)
    if (result === "queued") after(() => processConversation(loaded.conversation.id))
    refresh()
    if (result === "busy") return { ok: false, message: "O agente está analisando esta conversa agora. A tela atualiza sozinha." }
    return {
      ok: true,
      message: result === "queued" ? "Chegou mensagem nova: o agente já está analisando." : "Conversa, venda e envio atualizados.",
    }
  } catch (error) {
    return { ok: false, message: friendlyError(error) }
  }
}

export async function retryWithAgent(id: string): Promise<ActionResult> {
  const loaded = await loadConversation(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (busy(loaded.conversation)) return { ok: false, message: "O agente já está analisando esta conversa." }
  const { error } = await loaded.admin
    .from("ml_conversations")
    .update({ status: "pending", review_reason: null, attempts: 0, next_attempt_at: new Date().toISOString(), locked_until: null, last_error: null })
    .eq("id", loaded.conversation.id)
  if (error) throw error
  after(() => processConversation(loaded.conversation.id))
  refresh()
  return { ok: true, message: "O agente vai analisar esta conversa de novo." }
}

export async function archiveConversation(id: string): Promise<ActionResult> {
  const loaded = await loadConversation(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (busy(loaded.conversation)) return { ok: false, message: "O agente está analisando esta conversa agora." }
  const { error } = await loaded.admin
    .from("ml_conversations")
    .update({ status: "archived", review_reason: null })
    .eq("id", loaded.conversation.id)
  if (error) throw error
  refresh()
  return { ok: true, message: "Conversa arquivada. Se o comprador escrever de novo, ela volta sozinha." }
}

export async function restoreConversation(id: string): Promise<ActionResult> {
  const loaded = await loadConversation(id)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (loaded.conversation.status !== "archived") return { ok: false, message: "Essa conversa não está arquivada." }
  const { error } = await loaded.admin
    .from("ml_conversations")
    .update({ status: "needs_review", review_reason: null })
    .eq("id", loaded.conversation.id)
  if (error) throw error
  try {
    await refreshConversation(loaded.conversation.id)
  } catch (refreshError) {
    console.error("[pos-venda] desarquivar:", refreshError instanceof Error ? refreshError.message : refreshError)
  }
  refresh()
  return { ok: true, message: "Conversa desarquivada." }
}

export async function syncConversations(): Promise<ActionResult> {
  const context = await requireSection("pos_venda")
  const admin = createServiceClient()
  const { data: accounts, error } = await admin
    .from("ml_accounts")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("status", "active")
  if (error) throw error

  const queued: string[] = []
  const failures: string[] = []
  for (const account of accounts) {
    try {
      queued.push(...(await syncUnreadConversations(account.id)))
    } catch (syncError) {
      failures.push(friendlyError(syncError))
    }
  }
  if (queued.length) {
    after(async () => {
      for (const id of queued) await processConversation(id)
    })
  }
  refresh()
  if (failures.length && !queued.length) return { ok: false, message: failures[0] }
  return {
    ok: true,
    message: queued.length
      ? `${queued.length} conversa${queued.length === 1 ? " com mensagem não lida encontrada" : "s com mensagens não lidas encontradas"}. Já estamos analisando.`
      : "Tudo em dia: nenhuma mensagem não lida no Mercado Livre.",
  }
}

// ---------------------------------------------------------------- configuração do agente

async function loadAccount(accountId: unknown, { manage }: { manage: boolean }) {
  const context = await requireSection("pos_venda")
  if (manage && !canManageOrganization(context.role)) return { error: NO_PERMISSION } as const
  const parsed = uuid.safeParse(accountId)
  if (!parsed.success) return { error: "Conta não encontrada." } as const
  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select("id, organization_id, status")
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .neq("status", "disconnected")
    .maybeSingle()
  if (error) throw error
  if (!account) return { error: "Conta não encontrada." } as const
  return { context, admin, account } as const
}

export async function setAgentEnabled(accountId: string, enabled: boolean): Promise<ActionResult> {
  const loaded = await loadAccount(accountId, { manage: true })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  if (enabled && loaded.account.status !== "active") {
    return { ok: false, message: "Ative ou reconecte a conta antes de ligar o agente de pós-venda." }
  }
  const { error } = await loaded.admin.from("ml_accounts").update({ after_sale_enabled: enabled }).eq("id", loaded.account.id)
  if (error) throw error
  refresh()
  return {
    ok: true,
    message: enabled
      ? "Agente ligado. As próximas mensagens de compradores já serão respondidas por ele."
      : "Agente pausado. As mensagens ficam para você responder em Pós-venda.",
  }
}

const settingsSchema = z.object({
  policy: z.enum(SENSITIVE_POLICIES.map((policy) => policy.value) as [string, ...string[]], {
    errorMap: () => ({ message: "Escolha o que fazer com assuntos delicados." }),
  }),
  threshold: z.enum(AFTER_SALE_CONFIDENCE_PRESETS.map((preset) => preset.value) as [string, ...string[]], {
    errorMap: () => ({ message: "Escolha um nível de cuidado." }),
  }),
  signature: z
    .string()
    .trim()
    .max(AFTER_SALE_SIGNATURE_LIMIT, `Use no máximo ${AFTER_SALE_SIGNATURE_LIMIT} caracteres.`)
    .refine((value) => !containsExternalContact(value), NO_CONTACT),
  instructions: z
    .string()
    .trim()
    .max(AFTER_SALE_INSTRUCTIONS_LIMIT, "Use no máximo 4.000 caracteres.")
    .refine((value) => !containsExternalContact(value), NO_CONTACT),
})

export async function updateAgentSettings(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "policy", "threshold", "signature", "instructions"])
  const parsed = settingsSchema.safeParse({
    policy: formData.get("policy"),
    threshold: formData.get("threshold"),
    signature: formData.get("signature") ?? "",
    instructions: String(formData.get("instructions") ?? "").replace(/\r\n/g, "\n"),
  })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }

  const { error } = await loaded.admin
    .from("ml_accounts")
    .update({
      after_sale_sensitive_policy: parsed.data.policy,
      after_sale_confidence_threshold: Number(parsed.data.threshold),
      after_sale_signature: toMlMessageText(parsed.data.signature).replace(/\s+/g, " "),
      after_sale_instructions: parsed.data.instructions,
    })
    .eq("id", loaded.account.id)
  if (error) return { message: SAVE_ERROR, values }
  refresh()
  return { ok: true, message: "Configuração do agente salva.", values }
}

const exampleSchema = z.object({
  buyerMessage: z.string().trim().min(3, "Escreva a mensagem do comprador.").max(2000, "Mensagem muito longa."),
  answer: z
    .string()
    .trim()
    .min(2, "Escreva a resposta.")
    .max(350, "A resposta pode ter no máximo 350 caracteres (limite do Mercado Livre).")
    .refine((value) => !containsExternalContact(value), NO_CONTACT),
})

export async function addAfterSaleExample(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["accountId", "buyerMessage", "answer"])
  const parsed = exampleSchema.safeParse({ buyerMessage: formData.get("buyerMessage"), answer: formData.get("answer") })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  const loaded = await loadAccount(formData.get("accountId"), { manage: true })
  if ("error" in loaded) return { message: loaded.error, values }
  const { error } = await loaded.admin.from("after_sale_examples").insert({
    organization_id: loaded.account.organization_id,
    ml_account_id: loaded.account.id,
    buyer_message: parsed.data.buyerMessage,
    answer_text: toMlMessageText(parsed.data.answer).replace(/\s+/g, " "),
    created_by: loaded.context.user.id,
  })
  if (error) return { message: SAVE_ERROR, values }
  refresh()
  return { ok: true, message: "Resposta ensinada. O agente vai usá-la em mensagens parecidas.", values: { accountId: loaded.account.id } }
}

export async function deleteAfterSaleExample(id: string): Promise<ActionResult> {
  const context = await requireSection("pos_venda")
  if (!canManageOrganization(context.role)) return { ok: false, message: NO_PERMISSION }
  if (!uuid.safeParse(id).success) return { ok: false, message: "Resposta não encontrada." }
  const { error } = await createServiceClient()
    .from("after_sale_examples")
    .delete()
    .eq("id", id)
    .eq("organization_id", context.organization.id)
  if (error) throw error
  refresh()
  return { ok: true, message: "Resposta ensinada removida." }
}

// ---------------------------------------------------------------- testar

export type AgentTestResult =
  | {
      ok: true
      outcome: "send" | "review"
      text: string
      confidence: number
      reason: string
      topic: string
      reviewLabel: string | null
      saleLabel: string | null
      saleText: string | null
    }
  | { ok: false; message: string }

/** Número da venda (ou do pacote) informado pelo vendedor: só os dígitos. */
function parseSaleReference(value: string): string | null {
  const match = /\d{8,30}/.exec(value.replace(/[\s.#-]/g, ""))
  return match ? match[0] : null
}

export async function testAfterSaleAgent(accountId: string, rawMessage: string, saleReference: string): Promise<AgentTestResult> {
  const loaded = await loadAccount(accountId, { manage: false })
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const message = rawMessage.replace(/\s+/g, " ").trim()
  if (message.length < 3) return { ok: false, message: "Escreva a mensagem do comprador." }
  if (message.length > 2000) return { ok: false, message: "Mensagem muito longa (máximo de 2.000 caracteres)." }
  const saleId = saleReference.trim() ? parseSaleReference(saleReference) : null
  if (saleReference.trim() && !saleId) return { ok: false, message: "Informe o número da venda (só os números)." }

  try {
    const test = await testAgent({ accountId: loaded.account.id, buyerMessage: message, saleId })
    const review = test.decision.kind === "review"
    return {
      ok: true,
      outcome: review ? "review" : "send",
      text: test.decision.kind === "send" ? test.decision.text : test.composedDraft,
      confidence: test.result.confidence,
      reason: test.result.reason,
      topic: TOPIC_LABELS[test.result.topic],
      reviewLabel: test.decision.kind === "review" ? AFTER_SALE_REVIEW_LABELS[test.decision.reason] : null,
      saleLabel: test.saleLabel,
      saleText: test.saleText ? `${test.saleText.order}\n\n${test.saleText.shipping}` : null,
    }
  } catch (error) {
    console.error("[pos-venda] teste:", error instanceof Error ? error.message : error)
    if (
      error instanceof ConversationUnavailableError ||
      error instanceof MlAccountUnavailableError ||
      error instanceof PlatformAiPausedError
    ) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: "O agente não respondeu agora. Tente de novo em instantes." }
  }
}
