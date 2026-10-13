import "server-only"

import type OpenAI from "openai"

import {
  envOpenAIKey,
  MissingOpenAIKeyError,
  openAIClientFor,
  reportRejectedOpenAIKey,
  resolveOpenAIKey,
  type ResolvedOpenAIKey,
} from "@/lib/ai/key-store"
import { isRejectedKeyError, redactSecrets, type AiKeySource } from "@/lib/ai/keys"
import { estimateCostUsd, EMPTY_USAGE, normalizeUsage, type TokenUsage } from "@/lib/ai/pricing"
import { createServiceClient } from "@/lib/supabase/admin"

/** Onde a IA foi usada (mesmos valores do CHECK de ai_usage_events.feature). */
export type AiFeature =
  | "question_answer"
  | "question_suggestion"
  | "assistant_test"
  | "after_sale_answer"
  | "after_sale_suggestion"
  | "after_sale_test"
  | "key_check"

/** Quem gastou: toda chamada à OpenAI informa a organização/conta para o painel do administrador. */
export type AiUsageContext = {
  feature: AiFeature
  organizationId: string | null
  mlAccountId?: string | null
  questionId?: string | null
  conversationId?: string | null
}

export class PlatformAiPausedError extends Error {
  constructor() {
    super("A IA da maanu está pausada temporariamente para manutenção. Tente de novo mais tarde.")
    this.name = "PlatformAiPausedError"
  }
}

/** Pausa geral da IA ligada pelo administrador (botão de emergência do painel). */
export async function isPlatformAiPaused(): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("platform_settings")
    .select("ai_paused")
    .eq("id", true)
    .maybeSingle()
  if (error) {
    // Sem conseguir ler a configuração, a IA segue funcionando (a pausa é uma exceção, não a regra).
    console.error("[ia] pausa geral:", error.message)
    return false
  }
  return Boolean(data?.ai_paused)
}

/** Texto do erro que vai para o banco: curto e sem pedaços de chave. */
export function aiErrorText(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 300)
}

/** Registra uma chamada em ai_usage_events (tokens, custo, latência, chave usada). Nunca derruba a resposta. */
export async function recordAiUsage(
  context: AiUsageContext,
  entry: {
    model: string
    usage: TokenUsage
    success: boolean
    latencyMs: number
    error?: string
    key: { id: string | null; source: AiKeySource } | null
  }
) {
  const cost = estimateCostUsd(entry.model, entry.usage)
  if (cost === null) console.warn(`[ia] modelo sem preço cadastrado em lib/ai/pricing.ts: ${entry.model}`)
  const { error } = await createServiceClient()
    .from("ai_usage_events")
    .insert({
      organization_id: context.organizationId,
      ml_account_id: context.mlAccountId ?? null,
      question_id: context.questionId ?? null,
      conversation_id: context.conversationId ?? null,
      feature: context.feature,
      model: entry.model.slice(0, 100),
      input_tokens: entry.usage.inputTokens,
      cached_input_tokens: entry.usage.cachedInputTokens,
      output_tokens: entry.usage.outputTokens,
      reasoning_tokens: entry.usage.reasoningTokens,
      total_tokens: entry.usage.totalTokens,
      cost_usd: cost ?? 0,
      success: entry.success,
      error: entry.error ? redactSecrets(entry.error).slice(0, 300) : null,
      latency_ms: Math.max(0, Math.round(entry.latencyMs)),
      ai_key_id: entry.key?.source === "panel" ? entry.key.id : null,
      key_source: entry.key?.source ?? null,
    })
  // O registro de uso nunca derruba a resposta ao comprador.
  if (error) console.error("[ia] registro de uso:", error.message)
}

/**
 * Faz uma chamada à OpenAI respeitando a pausa geral, com a chave em uso (painel → variável OPENAI_API_KEY), e registra
 * tokens, custo, latência, falhas e a chave usada. Se a OpenAI recusar a chave do painel (HTTP 401), ela é desativada,
 * a reserva entra no lugar e a chamada é repetida UMA vez com a nova chave (nada foi processado na recusada).
 * `context = null` só nos testes com a IA real (sem banco): usa OPENAI_API_KEY, não confere a pausa nem registra.
 */
export async function trackedCompletion<T extends { usage?: unknown }>(
  context: AiUsageContext | null,
  model: string,
  call: (client: OpenAI) => Promise<T>
): Promise<T> {
  if (!context) {
    const key = envOpenAIKey()
    if (!key) throw new MissingOpenAIKeyError()
    return call(openAIClientFor(key))
  }
  if (await isPlatformAiPaused()) throw new PlatformAiPausedError()

  let key: ResolvedOpenAIKey
  try {
    key = await resolveOpenAIKey()
  } catch (error) {
    await recordAiUsage(context, {
      model,
      usage: EMPTY_USAGE,
      success: false,
      latencyMs: 0,
      error: aiErrorText(error),
      key: null,
    })
    throw error
  }

  for (let attempt = 1; ; attempt += 1) {
    const startedAt = performance.now()
    try {
      const completion = await call(openAIClientFor(key))
      await recordAiUsage(context, {
        model,
        usage: normalizeUsage(completion.usage),
        success: true,
        latencyMs: performance.now() - startedAt,
        key,
      })
      return completion
    } catch (error) {
      const message = aiErrorText(error)
      await recordAiUsage(context, {
        model,
        usage: EMPTY_USAGE,
        success: false,
        latencyMs: performance.now() - startedAt,
        error: message,
        key,
      })
      if (attempt > 1 || key.source !== "panel" || !isRejectedKeyError(error)) throw error
      await reportRejectedOpenAIKey(key, message)
      const next = await resolveOpenAIKey({ fresh: true }).catch(() => null)
      if (!next || (next.source === key.source && next.id === key.id)) throw error
      key = next
    }
  }
}
