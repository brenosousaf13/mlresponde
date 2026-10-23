import "server-only"

import type { ReasoningEffort } from "openai/resources/shared"

import { trackedCompletion, type AiUsageContext } from "@/lib/ai/usage"
import { isLegacyChatModel } from "@/lib/answers/model"
import { serverEnv } from "@/lib/env"
import {
  PHOTO_REVIEW_SCHEMA,
  buildPhotoReviewMessages,
  normalizePhotoReview,
  visionModelFor,
  type PhotoReview,
  type PhotoReviewInput,
} from "@/lib/recovery/photo-review"

const MAX_OUTPUT_TOKENS = 2500

/** Foto reduzida no navegador (JPG/PNG) → data URL para a chamada com visão. */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer())
  return "data:" + file.type + ";base64," + bytes.toString("base64")
}

/**
 * Conferência das fotos pela IA COM VISÃO (Chat Completions com image_url; o GPT-6 Luna aceita imagem, e só o gpt-3.5 troca
 * para o modelo padrão). Raciocínio "low" e JSON Schema estrito. Registrada em ai_usage_events como recovery_photo_review
 * (não conta nas respostas do plano). Resposta malformada → null. usage = null só nos testes com a IA real.
 */
export async function runPhotoReviewModel(
  input: PhotoReviewInput,
  imageUrls: readonly string[],
  usage: AiUsageContext | null
): Promise<PhotoReview | null> {
  const model = visionModelFor(serverEnv.openaiModel())
  const legacy = isLegacyChatModel(model)
  const completion = await trackedCompletion(usage, model, (client) =>
    client.chat.completions.create({
      model,
      messages: buildPhotoReviewMessages(input, imageUrls),
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(legacy ? { temperature: 0.2 } : { reasoning_effort: "low" as ReasoningEffort }),
      response_format: {
        type: "json_schema",
        json_schema: { name: "conferencia_fotos", strict: true, schema: PHOTO_REVIEW_SCHEMA as unknown as Record<string, unknown> },
      },
    })
  )
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error("A IA não retornou conteúdo.")
  return normalizePhotoReview(JSON.parse(content), input)
}