"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSection } from "@/lib/dal/app-context"
import { generateListingImprovement, ITEM_ID_PATTERN, ListingImprovementError } from "@/lib/listing-improvements/engine"
import { readImprovementResult, toggleDoneIndex } from "@/lib/listing-improvements/parse"
import { createServiceClient } from "@/lib/supabase/admin"

export type AnalyzeResult = { ok: true; id: string } | { ok: false; message: string; code?: string }

const analyzeSchema = z.object({
  accountId: z.string().uuid(),
  itemId: z.string().regex(ITEM_ID_PATTERN),
})

/** Gera as sugestões de melhoria de um anúncio (gasta 1 análise da cota do plano). */
export async function analyzeListing(accountId: string, itemId: string): Promise<AnalyzeResult> {
  const context = await requireSection("melhorias")
  const parsed = analyzeSchema.safeParse({ accountId, itemId })
  if (!parsed.success) return { ok: false, message: "Anúncio inválido." }

  try {
    const { id } = await generateListingImprovement(context, parsed.data)
    revalidatePath("/melhorias")
    return { ok: true, id }
  } catch (error) {
    revalidatePath("/melhorias")
    if (error instanceof ListingImprovementError) return { ok: false, message: error.message, code: error.code }
    console.error("[melhorias] analisar:", error instanceof Error ? error.message : error)
    return { ok: false, message: "Não foi possível analisar agora. Tente de novo em instantes." }
  }
}

const toggleSchema = z.object({ id: z.string().uuid(), index: z.number().int().min(0).max(50), done: z.boolean() })

/** Marca (ou desmarca) uma sugestão como feita. */
export async function setSuggestionDone(id: string, index: number, done: boolean): Promise<{ ok: boolean; message?: string }> {
  const context = await requireSection("melhorias")
  const parsed = toggleSchema.safeParse({ id, index, done })
  if (!parsed.success) return { ok: false, message: "Sugestão não encontrada." }

  const admin = createServiceClient()
  const { data: row, error } = await admin
    .from("listing_improvements")
    .select("id, result, done_suggestions")
    .eq("id", parsed.data.id)
    .eq("organization_id", context.organization.id)
    .eq("status", "ready")
    .maybeSingle()
  if (error) throw error
  if (!row) return { ok: false, message: "Análise não encontrada." }

  const total = readImprovementResult(row.result).suggestions.length
  if (parsed.data.index >= total) return { ok: false, message: "Sugestão não encontrada." }
  const next = toggleDoneIndex(row.done_suggestions, parsed.data.index, parsed.data.done, total)

  const { error: updateError } = await admin
    .from("listing_improvements")
    .update({ done_suggestions: next })
    .eq("id", row.id)
  if (updateError) {
    console.error("[melhorias] feito:", updateError.message)
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente." }
  }
  revalidatePath(`/melhorias/${row.id}`)
  revalidatePath("/melhorias")
  return { ok: true }
}
