import "server-only"

import { readClaimAnalysis } from "@/lib/reputation/claim-ai"
import { claimActions, type ClaimDetail, type ExpectedResolution, type OrderSummary } from "@/lib/reputation/claim-details"
import type { SellerAction } from "@/lib/reputation/claims"
import { createClient } from "@/lib/supabase/server"

// Leituras das reclamações do Escudo de Reputação (RLS: só a própria organização).

/** Tipos que aparecem na lista de reclamações (cancelamentos ficam de fora). */
export const LISTED_CLAIM_TYPES = ["mediations", "returns", "change", "fulfillment", "ml_case"] as const

export const CLAIM_FILTERS = {
  precisam: { label: "Precisam de você" },
  mediacao: { label: "Em mediação" },
  abertas: { label: "Abertas" },
  encerradas: { label: "Encerradas" },
} as const

export type ClaimFilter = keyof typeof CLAIM_FILTERS

export function parseClaimFilter(value: unknown): ClaimFilter {
  return typeof value === "string" && value in CLAIM_FILTERS ? (value as ClaimFilter) : "precisam"
}

const LIST_COLUMNS =
  "id, claim_id, type, stage, status, reason_id, reason_detail, next_due_at, affects_reputation, ai_status, ai_result, order_summary, buyer_nickname, ml_created_at, ml_updated_at, last_message_from, seller_actions"

async function loadClaimRows(accountId: string, closed: boolean) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reputation_claims")
    .select(LIST_COLUMNS)
    .eq("ml_account_id", accountId)
    .in("type", [...LISTED_CLAIM_TYPES])
    .eq("status", closed ? "closed" : "opened")
    .order(closed ? "ml_updated_at" : "next_due_at", { ascending: !closed, nullsFirst: false })
    .limit(closed ? 50 : 200)
  if (error) throw error
  return data.map((row) => {
    const actions = claimActions((row.seller_actions as unknown as SellerAction[]) ?? [], row.status)
    return {
      ...row,
      claim_id: Number(row.claim_id),
      orderSummary: (row.order_summary as OrderSummary | null) ?? null,
      analysis: readClaimAnalysis(row.ai_result),
      // O ML espera uma ação do vendedor: alguma que a maanu executa ou uma obrigatória que só dá para fazer no ML.
      needsYou: actions.available.length > 0 || actions.onlyInMl.some((action) => action.mandatory),
    }
  })
}

/** Aba Reclamações: a lista do filtro escolhido (abertas por prazo; encerradas, as 50 mais recentes) e as contagens. */
export async function getClaimsTab(accountId: string, filter: ClaimFilter) {
  const open = await loadClaimRows(accountId, false)
  const counts: Record<Exclude<ClaimFilter, "encerradas">, number> = {
    precisam: open.filter((row) => row.needsYou).length,
    mediacao: open.filter((row) => row.stage === "dispute").length,
    abertas: open.length,
  }
  const rows =
    filter === "encerradas"
      ? await loadClaimRows(accountId, true)
      : filter === "precisam"
        ? open.filter((row) => row.needsYou)
        : filter === "mediacao"
          ? open.filter((row) => row.stage === "dispute")
          : open
  return { rows, counts }
}

/** Contagem leve para a aba (abertas e quantas esperam o vendedor). */
export async function countOpenClaims(accountId: string): Promise<{ open: number; needsYou: number }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reputation_claims")
    .select("status, seller_actions")
    .eq("ml_account_id", accountId)
    .in("type", [...LISTED_CLAIM_TYPES])
    .eq("status", "opened")
    .limit(500)
  if (error) throw error
  const needsYou = data.filter((row) => {
    const actions = claimActions((row.seller_actions as unknown as SellerAction[]) ?? [], row.status)
    return actions.available.length > 0 || actions.onlyInMl.some((action) => action.mandatory)
  }).length
  return { open: data.length, needsYou }
}

export async function getClaimPage(organizationId: string, claimRowId: string) {
  const supabase = await createClient()
  const { data: claim, error } = await supabase
    .from("reputation_claims")
    .select("*, ml_accounts(nickname, ml_user_id)")
    .eq("id", claimRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!claim) return null
  const [messages, actions] = await Promise.all([
    supabase
      .from("reputation_claim_messages")
      .select("id, sender_role, receiver_role, message, message_at, status, moderation_status, attachments")
      .eq("claim_row_id", claimRowId)
      .order("message_at", { ascending: true })
      .limit(300),
    supabase
      .from("reputation_claim_actions")
      .select("id, action, receiver_role, details, status, error, performed_at")
      .eq("claim_row_id", claimRowId)
      .order("performed_at", { ascending: false })
      .limit(50),
  ])
  if (messages.error) throw messages.error
  if (actions.error) throw actions.error
  const sellerActions = (claim.seller_actions as unknown as SellerAction[]) ?? []
  return {
    claim: { ...claim, claim_id: Number(claim.claim_id) },
    accountName: claim.ml_accounts?.nickname || "Conta " + (claim.ml_accounts?.ml_user_id ?? ""),
    detail: (claim.detail as ClaimDetail | null) ?? null,
    expected: (Array.isArray(claim.expected_resolutions) ? claim.expected_resolutions : []) as unknown as ExpectedResolution[],
    orderSummary: (claim.order_summary as OrderSummary | null) ?? null,
    shipping: (claim.shipping as { status?: string | null; substatus?: string | null; tracking_number?: string | null } | null) ?? null,
    analysis: readClaimAnalysis(claim.ai_result),
    actions: claimActions(sellerActions, claim.status),
    messages: messages.data,
    history: actions.data,
  }
}

export type ClaimPageData = NonNullable<Awaited<ReturnType<typeof getClaimPage>>>
export type ClaimListRow = Awaited<ReturnType<typeof getClaimsTab>>["rows"][number]
