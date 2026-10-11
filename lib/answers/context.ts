import "server-only"

import { compileSellerRules, compileStoreKnowledge, parseStoreProfile, storeNameFrom } from "@/lib/assistant/profile"
import { parseAnswerMode, type AnswerTone } from "@/lib/answers/decision"
import { rankTaughtExamples } from "@/lib/answers/examples"
import type { PromptExample, PromptInput } from "@/lib/answers/prompt"
import type { Json } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

type ServiceClient = ReturnType<typeof createServiceClient>

export type AssistantAccount = {
  id: string
  nickname: string | null
  answer_tone: string
  answer_mode: string
  store_briefing: string
  store_profile: Json
  organizations: { name: string } | null
}

/** Parte do prompt que vem da configuração da conta (nome, tom, modo, conhecimento da loja e regras). */
export function assistantBase(
  account: AssistantAccount
): Pick<PromptInput, "storeName" | "tone" | "mode" | "knowledge" | "sellerRules"> {
  const profile = parseStoreProfile(account.store_profile)
  return {
    storeName: storeNameFrom(profile, account.organizations?.name ?? account.nickname ?? "Loja"),
    tone: account.answer_tone as AnswerTone,
    mode: parseAnswerMode(account.answer_mode),
    knowledge: compileStoreKnowledge(profile, account.store_briefing),
    sellerRules: compileSellerRules(profile),
  }
}

/** Respostas ensinadas mais parecidas com a pergunta (do anúncio + gerais da conta). */
export async function loadTaughtExamples(
  admin: ServiceClient,
  accountId: string,
  itemId: string | null,
  questionText: string,
  limit = 12
): Promise<PromptExample[]> {
  let query = admin
    .from("ai_examples")
    .select("item_id, question_text, answer_text")
    .eq("ml_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(300)
  query = itemId ? query.or(`item_id.eq.${itemId},item_id.is.null`) : query.is("item_id", null)
  const { data, error } = await query
  if (error) throw error

  return rankTaughtExamples(
    questionText,
    (data ?? []).map((example) => ({ question: example.question_text, answer: example.answer_text, itemId: example.item_id })),
    itemId,
    limit
  ).map(({ question, answer }) => ({ question, answer }))
}
