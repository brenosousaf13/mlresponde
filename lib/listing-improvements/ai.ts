import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { isLegacyChatModel } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"
import { normalizeImprovementResult, type ImprovementResult } from "@/lib/listing-improvements/parse"
import {
  buildImprovementMessages,
  IMPROVEMENT_RESULT_SCHEMA,
  type ImprovementPromptInput,
} from "@/lib/listing-improvements/prompt"

/** Saída maior que a das respostas: até 6 sugestões com textos prontos (e algum raciocínio no GPT-6). */
const IMPROVEMENT_MAX_OUTPUT_TOKENS = 8000

export type ImprovementRun = { result: ImprovementResult; model: string; tokens: number }

/**
 * Análise de um anúncio. Diferente das respostas (alto volume, sem raciocínio), aqui o volume é baixo e a qualidade
 * importa mais: o GPT-6 roda com raciocínio "low". Modelos antigos (OPENAI_MODEL=gpt-4*) usam temperatura.
 * `usage = null` só nos testes com a IA real (sem banco), como nos outros agentes.
 */
export async function runImprovementModel(input: ImprovementPromptInput, usage: AiUsageContext | null): Promise<ImprovementRun> {
  const model = serverEnv.openaiModel()
  const legacy = isLegacyChatModel(model)
  const completion = await trackedCompletion(usage, model, (client) =>
    client.chat.completions.create({
      model,
      messages: buildImprovementMessages(input),
      max_completion_tokens: IMPROVEMENT_MAX_OUTPUT_TOKENS,
      ...(legacy ? { temperature: 0.3 } : { reasoning_effort: "low" as ReasoningEffort }),
      response_format: {
        type: "json_schema",
        json_schema: { name: "melhorias_anuncio", strict: true, schema: IMPROVEMENT_RESULT_SCHEMA },
      },
    })
  )

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  return {
    result: normalizeImprovementResult(JSON.parse(content), input.questions.length),
    model,
    tokens: completion.usage?.total_tokens ?? 0,
  }
}
