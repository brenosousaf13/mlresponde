import "server-only"

import OpenAI from "openai"
import type { ReasoningEffort } from "openai/resources/shared"

import { classifyOpenAIError, redactSecrets, type OpenAIErrorKind } from "@/lib/ai/keys"
import { EMPTY_USAGE, normalizeUsage } from "@/lib/ai/pricing"
import { recordAiUsage } from "@/lib/ai/usage"
import { answerModelOptions } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"

export type KeyCheckResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; model: string; kind: OpenAIErrorKind; message: string }

/**
 * Testa uma chave de verdade antes de ela entrar em uso ou na reserva: uma resposta mínima no mesmo modelo e com os
 * mesmos parâmetros das respostas da maanu (custa uma fração de centavo e fica em Uso de IA como "Teste de chave").
 * Não respeita a pausa geral de propósito: é com ela ligada que se costuma trocar uma chave.
 * `keyId` = chave já gravada (nulo quando ainda está sendo cadastrada).
 */
export async function checkOpenAIKey(apiKey: string, keyId: string | null): Promise<KeyCheckResult> {
  const model = serverEnv.openaiModel()
  const { reasoning_effort, ...options } = answerModelOptions(model)
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 20_000 })
  const context = { feature: "key_check", organizationId: null } as const
  const key = { id: keyId, source: "panel" } as const
  const startedAt = performance.now()
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Teste de conexão da maanu. Responda apenas: ok" }],
      ...options,
      max_completion_tokens: 16,
      // Mesmo ajuste de lib/answers/ai.ts: o SDK 4.x não tipa "none".
      ...(reasoning_effort ? { reasoning_effort: reasoning_effort as unknown as ReasoningEffort } : {}),
    })
    const latencyMs = performance.now() - startedAt
    await recordAiUsage(context, { model, usage: normalizeUsage(completion.usage), success: true, latencyMs, key })
    return { ok: true, model, latencyMs }
  } catch (error) {
    const info = classifyOpenAIError(error, model)
    const raw = error instanceof Error ? error.message : String(error)
    await recordAiUsage(context, {
      model,
      usage: EMPTY_USAGE,
      success: false,
      latencyMs: performance.now() - startedAt,
      error: redactSecrets(raw),
      key,
    })
    return { ok: false, model, ...info }
  }
}
