import "server-only"

import { randomUUID } from "node:crypto"

import { computeAccess } from "@/lib/access/access"
import { runAfterSaleModel, type AfterSaleRun } from "@/lib/after-sale/ai"
import { PlatformAiPausedError } from "@/lib/ai/usage"
import {
  extractPackId,
  isBlockedSendError,
  isRecipientError,
  isRejectedMessage,
  isTooLongError,
  matchLocalMessage,
  normalizeConversation,
  parseUnreadPacks,
  pendingBuyerMessages,
  postedMessageInfo,
  recipientCandidates,
  type ConversationState,
  type MessageAttachment,
  type NormalizedMessage,
} from "@/lib/after-sale/conversation"
import {
  decideAfterSale,
  parseSensitivePolicy,
  parseTopic,
  type AfterSaleAiResult,
  type AfterSaleReviewReason,
} from "@/lib/after-sale/decision"
import {
  buildOrderSnapshot,
  conversationOrderColumns,
  parseOrderSnapshot,
  summarizeOrderForPrompt,
  type OrderSnapshot,
} from "@/lib/after-sale/order"
import type { AfterSaleExample, AfterSalePromptInput, HistoryMessage } from "@/lib/after-sale/prompt"
import { bodyLimit, composeAfterSaleMessage, toMlMessageText } from "@/lib/after-sale/text"
import { assistantBase } from "@/lib/answers/context"
import { RETRY_LIMIT, retryDelayMs } from "@/lib/answers/decision"
import { rankTaughtExamples } from "@/lib/answers/examples"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { mlImageUrl } from "@/lib/mercadolivre/images"
import { summarizeItem, type MlItem } from "@/lib/mercadolivre/item"
import {
  fetchConversationPages,
  fetchMessageDetail,
  fetchSaleOrders,
  fetchShipment,
  fetchUnreadConversations,
  fetchUserNickname,
  sendConversationMessage,
  uploadMessageAttachment,
} from "@/lib/mercadolivre/messages"
import { fetchItem, fetchItemContext } from "@/lib/mercadolivre/questions"
import { answersQuotaFor } from "@/lib/dal/plan"
import { organizationIncludes } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"
import type { Database, Json } from "@/lib/supabase/database.types"

type ServiceClient = ReturnType<typeof createServiceClient>
type ConversationRow = Database["public"]["Tables"]["ml_conversations"]["Row"]
type ConversationUpdate = Database["public"]["Tables"]["ml_conversations"]["Update"]
type MessageRow = Database["public"]["Tables"]["ml_conversation_messages"]["Row"]

const ACCOUNT_FIELDS =
  "id, organization_id, ml_user_id, nickname, site_id, status, answer_tone, answer_mode, store_briefing, store_profile, after_sale_enabled, after_sale_instructions, after_sale_confidence_threshold, after_sale_sensitive_policy, after_sale_signature, organizations(name, plan, created_at, monthly_answers_limit, trial_ends_at, subscription_status, current_period_end, billing_exempt)"

const MANUAL_LOCK_SECONDS = 90

async function loadAccount(admin: ServiceClient, accountId: string) {
  const { data, error } = await admin.from("ml_accounts").select(ACCOUNT_FIELDS).eq("id", accountId).single()
  if (error) throw error
  return data
}

export type AfterSaleAccount = Awaited<ReturnType<typeof loadAccount>>

async function loadConversation(admin: ServiceClient, id: string) {
  const { data, error } = await admin.from("ml_conversations").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function save(admin: ServiceClient, id: string, values: ConversationUpdate) {
  const { error } = await admin.from("ml_conversations").update(values).eq("id", id)
  if (error) throw error
}

function isPermanent(error: unknown) {
  return error instanceof MlApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

/** O plano e a assinatura da organização permitem o pós-venda agora? */
export function afterSaleAvailability(account: Pick<AfterSaleAccount, "organizations">): "ok" | "access_blocked" | "plan_inactive" {
  const organization = account.organizations
  if (!organization || computeAccess(organization).state === "blocked") return "access_blocked"
  if (!organizationIncludes(organization, "pos_venda")) return "plan_inactive"
  return "ok"
}

// ---------------------------------------------------------------- registro e fila

/**
 * Coloca a conversa de uma venda na fila (cria se não existir). Se ela estiver sendo processada agora, marca para
 * processar de novo assim que terminar (chegou mensagem nova no meio do caminho).
 */
export async function registerConversation(params: { organizationId: string; mlAccountId: string; packId: string }) {
  const admin = createServiceClient()
  const { data: inserted, error } = await admin
    .from("ml_conversations")
    .upsert(
      { organization_id: params.organizationId, ml_account_id: params.mlAccountId, pack_id: params.packId },
      { onConflict: "ml_account_id,pack_id", ignoreDuplicates: true }
    )
    .select("id")
  if (error) throw error
  if (inserted?.length) return { id: inserted[0].id, isNew: true }

  const { data: existing, error: existingError } = await admin
    .from("ml_conversations")
    .select("id")
    .eq("ml_account_id", params.mlAccountId)
    .eq("pack_id", params.packId)
    .single()
  if (existingError) throw existingError

  const now = new Date().toISOString()
  const { data: busy, error: busyError } = await admin
    .from("ml_conversations")
    .update({ resync_requested: true })
    .eq("id", existing.id)
    .eq("status", "processing")
    .gt("locked_until", now)
    .select("id")
  if (busyError) throw busyError
  if (!busy?.length) {
    const { error: queueError } = await admin
      .from("ml_conversations")
      .update({ status: "pending", next_attempt_at: now, attempts: 0, last_error: null, locked_until: null })
      .eq("id", existing.id)
      .or(`status.neq.processing,locked_until.is.null,locked_until.lt.${now}`)
    if (queueError) throw queueError
  }
  return { id: existing.id, isNew: false }
}

// ---------------------------------------------------------------- sincronização com o ML

type Synced = {
  rows: MessageRow[]
  normalized: NormalizedMessage[]
  state: ConversationState
  snapshot: OrderSnapshot | null
  item: (MlItem & { seller_id?: number }) | null
  pending: MessageRow[]
  columns: ConversationUpdate
}

function attachmentsJson(list: MessageAttachment[]): Json {
  return list as unknown as Json
}

/** Copia as mensagens do ML para o banco, ligando as que nós enviamos (ainda "local:") ao id definitivo. */
async function storeMessages(admin: ServiceClient, conversation: ConversationRow, messages: NormalizedMessage[]) {
  const { data: existing, error } = await admin
    .from("ml_conversation_messages")
    .select("id, ml_message_id, sender, source, text, sent_at, ml_status, moderation_status, moderation_reason")
    .eq("conversation_id", conversation.id)
  if (error) throw error

  const byMlId = new Map(existing.map((row) => [row.ml_message_id, row]))
  const locals = existing.filter((row) => row.ml_message_id.startsWith("local:"))
  const inserts: Database["public"]["Tables"]["ml_conversation_messages"]["Insert"][] = []

  for (const message of messages) {
    const fields = {
      ml_status: message.status,
      moderation_status: message.moderationStatus,
      moderation_reason: message.moderationReason,
    }
    const found = byMlId.get(message.mlId)
    if (found) {
      if (found.ml_status !== fields.ml_status || found.moderation_status !== fields.moderation_status || found.moderation_reason !== fields.moderation_reason) {
        const { error: updateError } = await admin.from("ml_conversation_messages").update(fields).eq("id", found.id)
        if (updateError) throw updateError
      }
      continue
    }
    if (message.sender === "seller") {
      const local = matchLocalMessage(locals, message)
      if (local) {
        locals.splice(locals.indexOf(local), 1)
        const { error: linkError } = await admin
          .from("ml_conversation_messages")
          .update({ ...fields, ml_message_id: message.mlId, sent_at: message.sentAt })
          .eq("id", local.id)
        if (linkError) throw linkError
        continue
      }
    }
    inserts.push({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      ml_message_id: message.mlId,
      sender: message.sender,
      source: message.sender === "buyer" ? "buyer" : "external",
      text: message.text.slice(0, 10_000),
      attachments: attachmentsJson(message.attachments),
      sent_at: message.sentAt,
      ...fields,
    })
  }
  if (inserts.length) {
    const { error: insertError } = await admin
      .from("ml_conversation_messages")
      .upsert(inserts, { onConflict: "conversation_id,ml_message_id", ignoreDuplicates: true })
    if (insertError) throw insertError
  }

  const { data: rows, error: rowsError } = await admin
    .from("ml_conversation_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: true })
    .order("created_at", { ascending: true })
  if (rowsError) throw rowsError
  return rows
}

/** Situação da conversa calculada a partir das mensagens guardadas. */
function messageColumns(rows: MessageRow[]): ConversationUpdate & { pending: MessageRow[] } {
  const pending = pendingBuyerMessages(rows)
  const last = rows.at(-1) ?? null
  const lastReply = [...rows].reverse().find((row) => row.sender === "seller" && !isRejectedMessage(row)) ?? null
  const hasFiles = (row: MessageRow) => Array.isArray(row.attachments) && row.attachments.length > 0
  const lastText = last ? last.text.replace(/\s+/g, " ").trim() || (hasFiles(last) ? "[anexo]" : "") : null
  return {
    pending,
    last_message_at: last?.sent_at ?? null,
    last_message_from: last ? last.sender : null,
    last_message_text: lastText ? lastText.slice(0, 300) : null,
    last_answer_source: lastReply ? lastReply.source : null,
    pending_count: pending.length,
    awaiting_since: pending[0]?.sent_at ?? null,
  }
}

/** Busca no ML a conversa, a venda e o envio; guarda tudo e devolve o retrato atualizado. */
async function syncConversation(admin: ServiceClient, account: AfterSaleAccount, conversation: ConversationRow): Promise<Synced> {
  const [pages, sale] = await Promise.all([
    fetchConversationPages(account.id, conversation.pack_id, account.ml_user_id),
    fetchSaleOrders(account.id, conversation.pack_id),
  ])
  const { messages: normalized, state } = normalizeConversation(pages, account.ml_user_id)

  const previous = parseOrderSnapshot(conversation.order_summary)
  let snapshot: OrderSnapshot | null = previous
  const columns: ConversationUpdate = {}
  if (sale.orders.length) {
    const shipment = sale.shipmentId ? await fetchShipment(account.id, sale.shipmentId) : null
    snapshot = buildOrderSnapshot(sale.orders, shipment)
    // Falha passageira no envio: mantém o que já sabíamos em vez de apagar.
    if (!snapshot.shipment && sale.shipmentId && previous?.shipment) snapshot.shipment = previous.shipment
    Object.assign(columns, conversationOrderColumns(snapshot), { order_summary: snapshot as unknown as Json })
  }

  const buyerId = snapshot?.buyerId ?? conversation.buyer_id
  if (buyerId && !conversation.buyer_nickname) {
    const nickname = snapshot?.buyerNickname ?? (await fetchUserNickname(account.id, buyerId))
    if (nickname) columns.buyer_nickname = nickname.slice(0, 120)
  }

  let item: Synced["item"] = null
  const itemId = snapshot?.items[0]?.itemId ?? conversation.item_id
  if (itemId && (!conversation.item_thumbnail || conversation.item_id !== itemId)) {
    try {
      item = await fetchItem(account.id, itemId)
      columns.item_thumbnail = mlImageUrl(item.secure_thumbnail ?? item.thumbnail)
      columns.item_permalink = item.permalink ?? null
    } catch (error) {
      if (!isPermanent(error)) console.warn(`[pos-venda] anúncio ${itemId}:`, error instanceof Error ? error.message : error)
    }
  }

  const rows = await storeMessages(admin, conversation, normalized)
  const { pending, ...fromMessages } = messageColumns(rows)
  Object.assign(columns, fromMessages, {
    ml_status: state.blocked ? "blocked" : "active",
    ml_substatus: state.substatus,
    claim_open: state.claimOpen,
    max_message_length: state.maxLength,
    synced_at: new Date().toISOString(),
  })
  return { rows, normalized, state, snapshot, item, pending, columns }
}

// ---------------------------------------------------------------- IA

async function loadExamples(admin: ServiceClient, accountId: string, buyerText: string, limit = 8): Promise<AfterSaleExample[]> {
  const { data, error } = await admin
    .from("after_sale_examples")
    .select("buyer_message, answer_text")
    .eq("ml_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(300)
  if (error) throw error
  return rankTaughtExamples(
    buyerText,
    data.map((example) => ({ question: example.buyer_message, answer: example.answer_text, itemId: null })),
    null,
    limit
  ).map((example) => ({ buyerMessage: example.question, answer: example.answer }))
}

/** Anúncio do produto comprado para dúvidas de uso. Anúncio apagado/sem acesso: segue sem ele. */
async function loadItemSummary(accountId: string, itemId: string | null, known: Synced["item"]) {
  if (!itemId) return null
  try {
    const context = await fetchItemContext(accountId, itemId, known && known.id === itemId ? known : undefined)
    return summarizeItem(context.item, context.description, context.extras)
  } catch (error) {
    if (isPermanent(error)) return null
    throw error
  }
}

function historyFrom(rows: MessageRow[]): HistoryMessage[] {
  return rows.map((row) => ({
    sender: row.sender === "seller" ? "seller" : "buyer",
    text: row.text,
    sentAt: row.sent_at,
    attachments: Array.isArray(row.attachments) ? row.attachments.length : 0,
    rejected: row.sender === "seller" && isRejectedMessage(row),
  }))
}

async function buildPromptInput(admin: ServiceClient, account: AfterSaleAccount, synced: Synced): Promise<AfterSalePromptInput> {
  const buyerText = synced.pending.map((row) => row.text).join(" ") || synced.rows.at(-1)?.text || ""
  const snapshot = synced.snapshot
  const [examples, itemSummary] = await Promise.all([
    loadExamples(admin, account.id, buyerText),
    loadItemSummary(account.id, snapshot?.items[0]?.itemId ?? null, synced.item),
  ])
  const summary = snapshot
    ? summarizeOrderForPrompt(snapshot)
    : { order: "Os dados da venda não puderam ser lidos agora.", shipping: "Sem informações de envio disponíveis." }
  const base = assistantBase(account)
  return {
    storeName: base.storeName,
    tone: base.tone,
    knowledge: base.knowledge,
    sellerRules: base.sellerRules,
    instructions: account.after_sale_instructions,
    sensitivePolicy: parseSensitivePolicy(account.after_sale_sensitive_policy),
    orderSummary: summary.order,
    shippingSummary: summary.shipping,
    itemSummary,
    history: historyFrom(synced.rows),
    examples,
    maxChars: bodyLimit(synced.state.maxLength, account.after_sale_signature),
    now: new Date(),
  }
}

function aiFields(run: { result: AfterSaleAiResult; model: string; tokens: number }): ConversationUpdate {
  return {
    ai_draft: run.result.answer || null,
    ai_confidence: run.result.confidence,
    ai_reason: run.result.reason.slice(0, 1000),
    ai_topic: parseTopic(run.result.topic),
    ai_model: run.model,
    ai_tokens: run.tokens,
  }
}

// ---------------------------------------------------------------- envio

type SendOutcome =
  | { kind: "sent"; mlMessageId: string | null; mlStatus: string | null }
  | { kind: "blocked"; message: string }
  | { kind: "too_long" }
  | { kind: "rejected"; message: string }

async function deliver(
  account: AfterSaleAccount,
  conversation: ConversationRow,
  synced: Synced,
  text: string,
  attachments: string[] = []
): Promise<SendOutcome> {
  const candidates = recipientCandidates({
    siteId: account.site_id,
    conversationPath: synced.state.path,
    messages: synced.normalized,
    buyerId: synced.snapshot?.buyerId ?? conversation.buyer_id,
    sellerId: account.ml_user_id,
  })
  let lastMessage = "O Mercado Livre não aceitou o destinatário da mensagem."
  for (const toUserId of candidates) {
    try {
      const response = await sendConversationMessage({
        accountId: account.id,
        packId: conversation.pack_id,
        sellerId: account.ml_user_id,
        toUserId,
        text,
        attachments,
      })
      const info = postedMessageInfo(response)
      return { kind: "sent", mlMessageId: info.id, mlStatus: info.status }
    } catch (error) {
      if (!(error instanceof MlApiError) || error.status >= 500 || error.status === 429) throw error
      if (isRecipientError(error.status, error.message)) {
        lastMessage = error.message
        continue
      }
      if (isTooLongError(error.status, error.message)) return { kind: "too_long" }
      if (isBlockedSendError(error.status, error.message)) return { kind: "blocked", message: error.message }
      return { kind: "rejected", message: error.message }
    }
  }
  return { kind: "rejected", message: lastMessage }
}

async function recordSent(
  admin: ServiceClient,
  conversation: ConversationRow,
  outcome: Extract<SendOutcome, { kind: "sent" }>,
  values: { text: string; source: "ai" | "manual"; userId?: string | null; attachments?: MessageAttachment[] }
): Promise<ConversationUpdate> {
  const sentAt = new Date().toISOString()
  const { error } = await admin.from("ml_conversation_messages").upsert(
    {
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      ml_message_id: outcome.mlMessageId ?? `local:${randomUUID()}`,
      sender: "seller",
      source: values.source,
      text: values.text,
      attachments: attachmentsJson(values.attachments ?? []),
      ml_status: outcome.mlStatus,
      sent_at: sentAt,
      sent_by: values.userId ?? null,
    },
    { onConflict: "conversation_id,ml_message_id", ignoreDuplicates: true }
  )
  if (error) throw error
  return {
    status: "answered",
    last_answer_source: values.source,
    answered_at: sentAt,
    last_message_at: sentAt,
    last_message_from: "seller",
    last_message_text: (values.text || "[anexo]").slice(0, 300),
    pending_count: 0,
    awaiting_since: null,
    review_reason: null,
    last_error: null,
    locked_until: null,
  }
}

/** O ML não deixou enviar: confere a situação da conversa (fechada pelo ML ou recusa desta mensagem). */
async function afterRefusal(account: AfterSaleAccount, conversation: ConversationRow, message: string): Promise<ConversationUpdate> {
  try {
    const pages = await fetchConversationPages(account.id, conversation.pack_id, account.ml_user_id)
    const { state } = normalizeConversation(pages, account.ml_user_id)
    if (state.blocked) {
      return { status: "blocked", ml_status: "blocked", ml_substatus: state.substatus, claim_open: state.claimOpen, review_reason: null, locked_until: null }
    }
  } catch {
    // segue como recusa simples
  }
  return { status: "needs_review", review_reason: "send_rejected", last_error: message.slice(0, 500), locked_until: null }
}

// ---------------------------------------------------------------- processamento

function review(reason: AfterSaleReviewReason, extra: ConversationUpdate = {}): ConversationUpdate {
  return { status: "needs_review", review_reason: reason, locked_until: null, ...extra }
}

async function handleFailure(admin: ServiceClient, conversation: ConversationRow, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  console.error(`[pos-venda] conversa ${conversation.pack_id}:`, message)
  if (error instanceof MlAccountUnavailableError) {
    await save(admin, conversation.id, review("account_inactive", { last_error: message }))
    return
  }
  if (error instanceof PlatformAiPausedError) {
    await save(admin, conversation.id, review("auto_reply_off"))
    return
  }
  if (conversation.attempts >= RETRY_LIMIT) {
    await save(admin, conversation.id, review("processing_error", { last_error: message }))
    return
  }
  await save(admin, conversation.id, {
    status: "failed",
    last_error: message,
    locked_until: null,
    next_attempt_at: new Date(Date.now() + retryDelayMs(conversation.attempts)).toISOString(),
  })
}

/** Grava o resultado; se chegou mensagem nova durante o processamento, volta a conversa para a fila. */
async function finish(admin: ServiceClient, id: string, values: ConversationUpdate): Promise<boolean> {
  await save(admin, id, { ...values, locked_until: null })
  const { data, error } = await admin.from("ml_conversations").select("resync_requested").eq("id", id).single()
  if (error) throw error
  if (!data.resync_requested) return false
  await save(admin, id, { status: "pending", resync_requested: false, attempts: 0, next_attempt_at: new Date().toISOString() })
  return true
}

/** O que fazer sem chamar a IA (null = a IA deve analisar). */
function statusWithoutAi(account: AfterSaleAccount, synced: Synced): ConversationUpdate | null {
  if (synced.state.blocked) return { status: "blocked", review_reason: null }
  if (!synced.pending.length) return { status: "answered", review_reason: null }
  if (account.status !== "active") return review("account_inactive")
  const availability = afterSaleAvailability(account)
  if (availability !== "ok") return review(availability)
  if (synced.state.claimOpen) return review("claim_open")
  if (!account.after_sale_enabled) return review("auto_reply_off")
  return null
}

async function processOnce(conversationId: string): Promise<boolean> {
  const admin = createServiceClient()
  const { data: claimed, error: claimError } = await admin.rpc("claim_ml_conversation", { p_id: conversationId })
  if (claimError) throw claimError
  const conversation = claimed?.[0]
  if (!conversation) return false

  try {
    const account = await loadAccount(admin, conversation.ml_account_id)
    const synced = await syncConversation(admin, account, conversation)
    const decided = statusWithoutAi(account, synced)
    if (decided) return await finish(admin, conversation.id, { ...synced.columns, last_error: null, ...decided })
    // Limite de respostas automáticas do plano (perguntas + pós-venda): acabou → fica com o vendedor, sem gastar IA.
    if (account.organizations) {
      const quota = await answersQuotaFor(admin, conversation.organization_id, account.organizations)
      if (quota.level === "reached") {
        return await finish(admin, conversation.id, { ...synced.columns, last_error: null, ...review("answers_limit") })
      }
    }

    let run: AfterSaleRun
    try {
      run = await runAfterSaleModel(await buildPromptInput(admin, account, synced), {
        feature: "after_sale_answer",
        organizationId: conversation.organization_id,
        mlAccountId: account.id,
        conversationId: conversation.id,
      })
    } catch (error) {
      // Pausa geral da IA (painel do administrador): a conversa fica com o vendedor, sem gastar tentativa.
      if (error instanceof PlatformAiPausedError) {
        return await finish(admin, conversation.id, { ...synced.columns, last_error: null, ...review("auto_reply_off") })
      }
      throw error
    }
    const decision = decideAfterSale(run.result, {
      threshold: Number(account.after_sale_confidence_threshold),
      signature: account.after_sale_signature,
      sensitivePolicy: parseSensitivePolicy(account.after_sale_sensitive_policy),
      maxLength: synced.state.maxLength,
    })
    const base: ConversationUpdate = { ...synced.columns, ...aiFields(run), last_error: null }
    if (decision.kind === "review") return await finish(admin, conversation.id, { ...base, ...review(decision.reason) })

    // Guarda o rascunho antes de enviar: se o envio falhar de vez, o vendedor vê o que a IA ia dizer.
    await save(admin, conversation.id, base)
    const outcome = await deliver(account, conversation, synced, decision.text)
    if (outcome.kind === "sent") {
      return await finish(admin, conversation.id, await recordSent(admin, conversation, outcome, { text: decision.text, source: "ai" }))
    }
    if (outcome.kind === "too_long") return await finish(admin, conversation.id, review("answer_too_long"))
    return await finish(admin, conversation.id, await afterRefusal(account, conversation, outcome.message))
  } catch (error) {
    await handleFailure(admin, conversation, error)
    return false
  }
}

/** Processa a conversa: sincroniza com o ML e decide se o agente responde sozinho ou se fica para o vendedor. */
export async function processConversation(conversationId: string): Promise<void> {
  for (let round = 0; round < 3; round++) {
    if (!(await processOnce(conversationId))) return
  }
}

/** Reprocessa conversas novas, com nova tentativa vencida ou presas em processamento. */
export async function processDueConversations(limit = 10): Promise<number> {
  const admin = createServiceClient()
  const { data, error } = await admin.rpc("due_ml_conversations", { p_limit: limit })
  if (error) throw error
  for (const id of data ?? []) await processConversation(id)
  return data?.length ?? 0
}

/** Notificação de mensagem nova: descobre a venda, registra a conversa e processa. */
export async function handleMessageNotification(account: { id: string; organization_id: string }, messageId: string) {
  const detail = await fetchMessageDetail(account.id, messageId)
  const packId = extractPackId(detail)
  if (!packId) {
    console.warn(`[pos-venda] mensagem ${messageId} sem venda associada`)
    return
  }
  const registered = await registerConversation({ organizationId: account.organization_id, mlAccountId: account.id, packId })
  await processConversation(registered.id)
}

/** Conversas com mensagens não lidas no ML (botão "Sincronizar" e rotina de segurança). Devolve as que foram para a fila. */
export async function syncUnreadConversations(accountId: string): Promise<string[]> {
  const admin = createServiceClient()
  const { data: account, error } = await admin.from("ml_accounts").select("id, organization_id, status").eq("id", accountId).single()
  if (error) throw error
  if (account.status !== "active") return []
  const packs = parseUnreadPacks(await fetchUnreadConversations(accountId))
  const queued: string[] = []
  for (const packId of packs.slice(0, 200)) {
    const registered = await registerConversation({ organizationId: account.organization_id, mlAccountId: account.id, packId })
    queued.push(registered.id)
  }
  return queued
}

/**
 * Atualiza a conversa com o ML sem chamar a IA (botão "Atualizar" e conferência das que esperam o vendedor).
 * Se apareceu mensagem nova do comprador numa conversa já respondida, ela volta para a fila do agente.
 */
export async function refreshConversation(conversationId: string): Promise<"refreshed" | "queued" | "busy"> {
  const admin = createServiceClient()
  const conversation = await loadConversation(admin, conversationId)
  const busy = conversation.status === "processing" && conversation.locked_until && new Date(conversation.locked_until) > new Date()
  if (busy || conversation.status === "pending") return "busy"
  const account = await loadAccount(admin, conversation.ml_account_id)
  const synced = await syncConversation(admin, account, conversation)

  if (synced.pending.length && !synced.state.blocked && ["answered", "blocked"].includes(conversation.status)) {
    await save(admin, conversation.id, { ...synced.columns, status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() })
    return "queued"
  }
  let status: ConversationUpdate = {}
  if (synced.state.blocked) status = { status: "blocked", review_reason: null }
  else if (!synced.pending.length && conversation.status !== "archived") status = { status: "answered", review_reason: null }
  await save(admin, conversation.id, { ...synced.columns, ...status })
  return "refreshed"
}

/** Confere no ML as conversas que esperam o vendedor há mais tempo (podem ter sido respondidas direto no ML). */
export async function reconcileWaitingConversations(limit = 10): Promise<number> {
  const admin = createServiceClient()
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from("ml_conversations")
    .select("id")
    .eq("status", "needs_review")
    .lt("synced_at", staleBefore)
    .order("synced_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  for (const row of data) {
    try {
      await refreshConversation(row.id)
    } catch (refreshError) {
      // Marca a conferência mesmo com erro para não travar a rotina sempre nas mesmas conversas.
      await save(admin, row.id, { synced_at: new Date().toISOString() })
      console.error("[pos-venda] conferência:", refreshError instanceof Error ? refreshError.message : refreshError)
    }
  }
  return data.length
}

// ---------------------------------------------------------------- ações do vendedor

export class ConversationUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConversationUnavailableError"
  }
}

/** Reserva a conversa para o vendedor enviar (o agente não processa a mesma conversa ao mesmo tempo). */
async function lockForSeller(admin: ServiceClient, conversationId: string) {
  const now = new Date()
  const { data, error } = await admin
    .from("ml_conversations")
    .update({ status: "processing", locked_until: new Date(now.getTime() + MANUAL_LOCK_SECONDS * 1000).toISOString() })
    .eq("id", conversationId)
    .or(`status.neq.processing,locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select("id")
  if (error) throw error
  if (!data?.length) {
    throw new ConversationUnavailableError("O agente está analisando esta conversa agora. Tente de novo em alguns segundos.")
  }
}

export type ManualReplyInput = {
  conversationId: string
  text: string
  userId: string
  files?: File[]
  teach?: boolean
}

/** Envia uma resposta escrita pelo vendedor (com anexos opcionais) e, se pedido, ensina o agente. */
export async function sendManualReply(input: ManualReplyInput): Promise<void> {
  const admin = createServiceClient()
  const conversation = await loadConversation(admin, input.conversationId)
  const account = await loadAccount(admin, conversation.ml_account_id)
  if (account.status !== "active") throw new ConversationUnavailableError("Ative ou reconecte a conta do Mercado Livre para responder.")
  const availability = afterSaleAvailability(account)
  if (availability !== "ok") {
    throw new ConversationUnavailableError(
      availability === "plan_inactive" ? "O seu plano atual não inclui o pós-venda." : "Assinatura inativa."
    )
  }

  const text = toMlMessageText(input.text)
  const files = input.files ?? []
  if (!text && !files.length) throw new ConversationUnavailableError("Escreva a mensagem ou anexe um arquivo.")

  await lockForSeller(admin, conversation.id)
  const previousStatus = conversation.status === "processing" || conversation.status === "pending" ? "needs_review" : conversation.status
  const restore: ConversationUpdate = { status: previousStatus, locked_until: null }

  try {
    const synced = await syncConversation(admin, account, conversation)
    if (synced.state.blocked) {
      await save(admin, conversation.id, { ...synced.columns, status: "blocked", review_reason: null, locked_until: null })
      throw new ConversationUnavailableError("O Mercado Livre fechou esta conversa para novas mensagens.")
    }
    if (text.length > synced.state.maxLength) {
      throw new ConversationUnavailableError(`A mensagem pode ter no máximo ${synced.state.maxLength} caracteres.`)
    }

    const attachmentIds: string[] = []
    const attachmentInfo: MessageAttachment[] = []
    for (const file of files) {
      const id = await uploadMessageAttachment(account.id, file, account.site_id || "MLB")
      attachmentIds.push(id)
      attachmentInfo.push({ id, name: file.name, type: file.type || null, size: file.size })
    }

    const outcome = await deliver(account, conversation, synced, text, attachmentIds)
    if (outcome.kind === "blocked") {
      await save(admin, conversation.id, { ...synced.columns, ...(await afterRefusal(account, conversation, outcome.message)) })
      throw new ConversationUnavailableError("O Mercado Livre não deixou enviar nesta conversa agora.")
    }
    if (outcome.kind !== "sent") {
      await save(admin, conversation.id, { ...synced.columns, ...restore })
      throw new ConversationUnavailableError(
        outcome.kind === "too_long"
          ? "A mensagem passou do limite do Mercado Livre. Encurte o texto."
          : "O Mercado Livre recusou a mensagem. Confira se ela não tem contato externo, links ou dados pessoais."
      )
    }

    const sent = await recordSent(admin, conversation, outcome, { text, source: "manual", userId: input.userId, attachments: attachmentInfo })
    await finish(admin, conversation.id, { ...synced.columns, ...sent })

    const buyerMessage = synced.pending.map((row) => row.text).filter(Boolean).join(" ").slice(0, 2000)
    if (input.teach && buyerMessage && text) {
      const { error } = await admin.from("after_sale_examples").insert({
        organization_id: conversation.organization_id,
        ml_account_id: account.id,
        buyer_message: buyerMessage,
        answer_text: text.slice(0, 1000),
        source_conversation_id: conversation.id,
        created_by: input.userId,
      })
      if (error) console.error("[pos-venda] ensinar:", error.message)
    }
  } catch (error) {
    const { data: current } = await admin.from("ml_conversations").select("status").eq("id", conversation.id).single()
    if (current?.status === "processing") await save(admin, conversation.id, restore)
    throw error
  }
}

export type AfterSaleSuggestion = { composed: string; confidence: number; reason: string; topic: string }

/** Rascunho do agente para o vendedor revisar (não envia nada). */
export async function suggestReply(conversationId: string): Promise<AfterSaleSuggestion> {
  const admin = createServiceClient()
  const conversation = await loadConversation(admin, conversationId)
  const account = await loadAccount(admin, conversation.ml_account_id)
  const synced = await syncConversation(admin, account, conversation)
  const run = await runAfterSaleModel(await buildPromptInput(admin, account, synced), {
    feature: "after_sale_suggestion",
    organizationId: conversation.organization_id,
    mlAccountId: account.id,
    conversationId: conversation.id,
  })
  await save(admin, conversation.id, { ...synced.columns, ...aiFields(run) })
  return {
    composed: run.result.answer ? composeAfterSaleMessage(run.result.answer, account.after_sale_signature) : "",
    confidence: run.result.confidence,
    reason: run.result.reason,
    topic: run.result.topic,
  }
}

// ---------------------------------------------------------------- teste do agente (não envia nada)

/** Simula a resposta do agente para uma mensagem, opcionalmente com os dados de uma venda real da conta. */
export async function testAgent(input: { accountId: string; buyerMessage: string; saleId: string | null }) {
  const admin = createServiceClient()
  const account = await loadAccount(admin, input.accountId)
  let snapshot: OrderSnapshot | null = null
  if (input.saleId) {
    const sale = await fetchSaleOrders(account.id, input.saleId)
    if (!sale.orders.length) throw new ConversationUnavailableError("Não encontramos essa venda nesta conta do Mercado Livre.")
    if (sale.orders.some((order) => Number(order.seller?.id) && Number(order.seller?.id) !== account.ml_user_id)) {
      throw new ConversationUnavailableError("Essa venda não é desta conta do Mercado Livre.")
    }
    const shipment = sale.shipmentId ? await fetchShipment(account.id, sale.shipmentId) : null
    snapshot = buildOrderSnapshot(sale.orders, shipment)
  }

  const message = {
    sender: "buyer",
    text: input.buyerMessage,
    sent_at: new Date().toISOString(),
    attachments: [],
    ml_status: null,
    moderation_status: null,
  } as unknown as MessageRow
  const promptInput = await buildPromptInput(admin, account, {
    rows: [message],
    normalized: [],
    state: { blocked: false, substatus: null, path: null, claimOpen: false, maxLength: 350 },
    snapshot,
    item: null,
    pending: [message],
    columns: {},
  })
  if (!snapshot) {
    promptInput.orderSummary = "Teste sem venda: o vendedor está testando o agente sem escolher uma venda. Não há dados de pedido."
    promptInput.shippingSummary = "Teste sem venda: não há dados de envio."
  }
  const run = await runAfterSaleModel(promptInput, {
    feature: "after_sale_test",
    organizationId: account.organization_id,
    mlAccountId: account.id,
  })
  const decision = decideAfterSale(run.result, {
    threshold: Number(account.after_sale_confidence_threshold),
    signature: account.after_sale_signature,
    sensitivePolicy: parseSensitivePolicy(account.after_sale_sensitive_policy),
    maxLength: 350,
  })
  return {
    result: run.result,
    decision,
    composedDraft: run.result.answer ? composeAfterSaleMessage(run.result.answer, account.after_sale_signature) : "",
    saleLabel: snapshot ? `Venda ${snapshot.orderIds.join(", ")}${snapshot.items[0] ? ` — ${snapshot.items[0].title}` : ""}` : null,
    saleText: snapshot ? summarizeOrderForPrompt(snapshot) : null,
  }
}
