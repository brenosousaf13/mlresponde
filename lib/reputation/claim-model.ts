import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { isLegacyChatModel } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"
import {
  CLAIM_ANALYSIS_SCHEMA,
  buildClaimMessages,
  normalizeClaimAnalysis,
  type ClaimAnalysis,
  type ClaimPromptInput,
} from "@/lib/reputation/claim-ai"

const CLAIM_MAX_OUTPUT_TOKENS = 6000

/**
 * Análise de uma reclamação (gpt-6-luna com raciocínio "low", como as Melhorias de anúncio: pouco volume, qualidade
 * importa). Registrada em ai_usage_events como reputation_claim_analysis. usage = null só nos testes com a IA real.
 */
export async function runClaimAnalysisModel(
  input: ClaimPromptInput,
  usage: AiUsageContext | null
): Promise<{ analysis: ClaimAnalysis; model: string }> {
  const model = serverEnv.openaiModel()
  const legacy = isLegacyChatModel(model)
  const completion = await trackedCompletion(usage, model, (client) =>
    client.chat.completions.create({
      model,
      messages: buildClaimMessages(input),
      max_completion_tokens: CLAIM_MAX_OUTPUT_TOKENS,
      ...(legacy ? { temperature: 0.2 } : { reasoning_effort: "low" as ReasoningEffort }),
      response_format: {
        type: "json_schema",
        json_schema: { name: "analise_reclamacao", strict: true, schema: CLAIM_ANALYSIS_SCHEMA as unknown as Record<string, unknown> },
      },
    })
  )
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  return { analysis: normalizeClaimAnalysis(JSON.parse(content)), model }
}
