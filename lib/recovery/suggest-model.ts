import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { isLegacyChatModel } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"
import {
  SUGGESTION_SCHEMA,
  buildSuggestionMessages,
  normalizeSuggestion,
  type ReturnSuggestion,
  type SuggestInput,
} from "@/lib/recovery/suggest"

const MAX_OUTPUT_TOKENS = 1200

/**
 * Sugestão de ação pela IA (modelo do OPENAI_MODEL com raciocínio "low", JSON Schema estrito). Recebe os fatos e a sugestão
 * das regras; a resposta é validada por normalizeSuggestion (inválida → regras). Registrada em ai_usage_events como
 * recovery_suggest_action (não conta nas respostas do plano). usage = null só nos testes com a IA real.
 */
export async function runSuggestActionModel(
  input: SuggestInput,
  baseline: ReturnSuggestion,
  context: { storeName: string; itemTitle: string | null },
  usage: AiUsageContext | null
): Promise<ReturnSuggestion> {
  const model = serverEnv.openaiModel()
  const legacy = isLegacyChatModel(model)
  const completion = await trackedCompletion(usage, model, (client) =>
    client.chat.completions.create({
      model,
      messages: buildSuggestionMessages(context.storeName, input, baseline, context.itemTitle),
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(legacy ? { temperature: 0.2 } : { reasoning_effort: "low" as ReasoningEffort }),
      response_format: {
        type: "json_schema",
        json_schema: { name: "sugestao_devolucao", strict: true, schema: SUGGESTION_SCHEMA as unknown as Record<string, unknown> },
      },
    })
  )
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  return normalizeSuggestion(JSON.parse(content), input, baseline)
}