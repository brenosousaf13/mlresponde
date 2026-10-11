import "server-only"

import OpenAI from "openai"
import type { ReasoningEffort } from "openai/resources/shared"
import { z } from "zod"

import type { AiResult } from "@/lib/answers/decision"
import { answerModelOptions } from "@/lib/answers/model"
import { AI_RESULT_SCHEMA, buildMessages, type PromptInput } from "@/lib/answers/prompt"
import { serverEnv } from "@/lib/env"

const resultSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string(),
  confidence: z.number(),
  reason: z.string(),
})

let client: OpenAI | null = null

function getClient() {
  client ??= new OpenAI({ apiKey: serverEnv.openaiApiKey() })
  return client
}

export type AiRun = { result: AiResult; model: string; tokens: number }

export async function runAnswerModel(input: PromptInput): Promise<AiRun> {
  const model = serverEnv.openaiModel()
  const { reasoning_effort, ...options } = answerModelOptions(model)
  const completion = await getClient().chat.completions.create({
    model,
    messages: buildMessages(input),
    ...options,
    // O SDK 4.x só tipa low|medium|high; a API aceita "none" no GPT-6 Luna (sem raciocínio, como a gpt-4o-mini).
    ...(reasoning_effort ? { reasoning_effort: reasoning_effort as unknown as ReasoningEffort } : {}),
    response_format: {
      type: "json_schema",
      json_schema: { name: "resposta_pergunta", strict: true, schema: AI_RESULT_SCHEMA },
    },
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  const parsed = resultSchema.parse(JSON.parse(content))

  return {
    result: {
      ...parsed,
      answer: parsed.answer.trim(),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    },
    model,
    tokens: completion.usage?.total_tokens ?? 0,
  }
}
