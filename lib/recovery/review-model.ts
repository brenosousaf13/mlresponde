import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { isLegacyChatModel } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"
import {
  RETURN_MESSAGE_SCHEMA,
  buildReturnMessageMessages,
  normalizeReturnMessage,
  type ReturnMessageInput,
} from "@/lib/recovery/review-ai"

const MAX_OUTPUT_TOKENS = 2000

/**
 * Relato da devolução (modelo do OPENAI_MODEL com raciocínio "low", JSON Schema estrito). Registrado em ai_usage_events
 * como recovery_return_message (não conta nas respostas do plano). usage = null só nos testes com a IA real.
 */
export async function runReturnMessageModel(
  input: ReturnMessageInput,
  usage: AiUsageContext | null
): Promise<{ message: string; fromAi: boolean }> {
  const model = serverEnv.openaiModel()
  const legacy = isLegacyChatModel(model)
  const completion = await trackedCompletion(usage, model, (client) =>
    client.chat.completions.create({
      model,
      messages: buildReturnMessageMessages(input),
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(legacy ? { temperature: 0.2 } : { reasoning_effort: "low" as ReasoningEffort }),
      response_format: {
        type: "json_schema",
        json_schema: { name: "relato_devolucao", strict: true, schema: RETURN_MESSAGE_SCHEMA as unknown as Record<string, unknown> },
      },
    })
  )
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  return normalizeReturnMessage(JSON.parse(content), input)
}
