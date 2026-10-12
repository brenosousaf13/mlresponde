import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"
import { z } from "zod"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { AFTER_SALE_TOPICS, type AfterSaleAiResult } from "@/lib/after-sale/decision"
import { AFTER_SALE_RESULT_SCHEMA, buildAfterSaleMessages, type AfterSalePromptInput } from "@/lib/after-sale/prompt"
import { getOpenAIClient } from "@/lib/answers/ai"
import { answerModelOptions } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"

const resultSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string(),
  confidence: z.number(),
  reason: z.string(),
  topic: z.enum(AFTER_SALE_TOPICS),
})

export type AfterSaleRun = { result: AfterSaleAiResult; model: string; tokens: number }

/** Chama o agente de pós-venda. `usage`: como em runAnswerModel (null só nos testes com a IA real). */
export async function runAfterSaleModel(input: AfterSalePromptInput, usage: AiUsageContext | null): Promise<AfterSaleRun> {
  const model = serverEnv.openaiModel()
  const { reasoning_effort, ...options } = answerModelOptions(model)
  const completion = await trackedCompletion(usage, model, () =>
    getOpenAIClient().chat.completions.create({
      model,
      messages: buildAfterSaleMessages(input),
      ...options,
      // Mesmo ajuste do atendente de perguntas: o SDK 4.x não tipa "none" (GPT-6 sem raciocínio).
      ...(reasoning_effort ? { reasoning_effort: reasoning_effort as unknown as ReasoningEffort } : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: "resposta_pos_venda", strict: true, schema: AFTER_SALE_RESULT_SCHEMA },
      },
    })
  )

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  const parsed = resultSchema.parse(JSON.parse(content))
  return {
    result: {
      ...parsed,
      answer: parsed.answer.trim(),
      reason: parsed.reason.trim(),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    },
    model,
    tokens: completion.usage?.total_tokens ?? 0,
  }
}
