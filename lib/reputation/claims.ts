import { dayKey } from "@/lib/format"

/**
 * Reclamações do Mercado Livre → linhas da maanu e previsão de quando saem da conta da reputação (puro, testado).
 * Busca: /post-purchase/v1/claims/search?player_role=respondent&player_user_id={id} (os filtros "players.role" da
 * documentação são ignorados pela API; conferido em 2026-10-19).
 */

type IdLike = number | string | null | undefined

export type MlClaimAction = { action?: string | null; mandatory?: boolean | null; due_date?: string | null }

export type MlClaimPlayer = {
  role?: string | null
  type?: string | null
  user_id?: IdLike
  available_actions?: MlClaimAction[] | null
}

/** Reclamação como o ML devolve na busca e em /claims/{id}. */
export type MlClaim = {
  id?: IdLike
  resource_id?: IdLike
  status?: string | null
  type?: string | null
  stage?: string | null
  resource?: string | null
  reason_id?: string | null
  fulfilled?: boolean | null
  quantity_type?: string | null
  claim_version?: number | string | null
  players?: MlClaimPlayer[] | null
  resolution?: Record<string, unknown> | null
  date_created?: string | null
  last_updated?: string | null
}

export type MlClaimSearchPage = {
  paging?: { total?: number | null; offset?: number | null; limit?: number | null } | null
  data?: MlClaim[] | null
}

export type SellerAction = { action: string; mandatory: boolean; due_date: string | null }

/** Linha de reputation_claims (só os campos vindos da busca). */
export type ClaimRow = {
  claim_id: number
  resource: string | null
  resource_id: number | null
  type: string
  stage: string | null
  status: string
  reason_id: string | null
  fulfilled: boolean | null
  quantity_type: string | null
  seller_actions: SellerAction[]
  next_due_at: string | null
  resolution: Record<string, unknown> | null
  ml_created_at: string | null
  ml_updated_at: string | null
}

/** Tipos de reclamação que podem contar na reputação (os outros são cancelamentos, trocas, Full...). */
export const REPUTATION_CLAIM_TYPES = ["mediations", "returns"] as const

export function countsForReputation(type: string | null | undefined): boolean {
  return (REPUTATION_CLAIM_TYPES as readonly string[]).includes(type ?? "")
}

export function mlId(value: IdLike): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d{1,20}$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/** Ações disponíveis para o vendedor (o "respondent"). */
export function sellerActions(claim: MlClaim, sellerId: number): SellerAction[] {
  const players = claim.players ?? []
  const seller =
    players.find((player) => player.role === "respondent" && mlId(player.user_id) === sellerId) ??
    players.find((player) => player.role === "respondent")
  return (seller?.available_actions ?? [])
    .flatMap((action) => {
      const name = text(action?.action, 60)
      return name ? [{ action: name, mandatory: action?.mandatory === true, due_date: isoDate(action?.due_date) }] : []
    })
    .slice(0, 30)
}

/** Menor prazo entre as ações obrigatórias. */
export function nextDueAt(actions: readonly SellerAction[]): string | null {
  const dates = actions.flatMap((action) => (action.mandatory && action.due_date ? [Date.parse(action.due_date)] : []))
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null
}

/** O vendedor é o reclamado? (A busca por player_role=respondent já filtra; isto confere de novo.) */
export function sellerIsRespondent(claim: MlClaim, sellerId: number): boolean {
  return (claim.players ?? []).some((player) => player.role === "respondent" && mlId(player.user_id) === sellerId)
}

export function toClaimRow(claim: MlClaim, sellerId: number): ClaimRow | null {
  const claimId = mlId(claim.id)
  const type = text(claim.type, 40)
  const status = text(claim.status, 20)
  if (!claimId || !type || !status) return null
  const actions = sellerActions(claim, sellerId)
  return {
    claim_id: claimId,
    resource: text(claim.resource, 40),
    resource_id: mlId(claim.resource_id),
    type,
    stage: text(claim.stage, 40),
    status,
    reason_id: text(claim.reason_id, 40),
    fulfilled: typeof claim.fulfilled === "boolean" ? claim.fulfilled : null,
    quantity_type: text(claim.quantity_type, 20),
    seller_actions: actions,
    next_due_at: status === "opened" ? nextDueAt(actions) : null,
    resolution: claim.resolution && typeof claim.resolution === "object" ? claim.resolution : null,
    ml_created_at: isoDate(claim.date_created),
    ml_updated_at: isoDate(claim.last_updated),
  }
}

/** Data da busca no formato do ML (com milissegundos): 2026-10-19T12:00:00.000+00:00. */
export function mlRangeDate(date: Date): string {
  return date.toISOString().replace("Z", "+00:00")
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Até onde buscar as reclamações na primeira vez: o período da reputação + 30 dias de margem. */
export function claimsBackfillSince(periodDays: number | null, now: Date = new Date()): Date {
  return new Date(now.getTime() - ((periodDays ?? 365) + 30) * DAY_MS)
}

/** Quando a reclamação sai da conta da reputação: data da venda + período (estimativa). */
export function leavesAt(saleAt: string, periodDays: number): Date {
  return new Date(Date.parse(saleAt) + periodDays * DAY_MS)
}

export type ForecastClaim = { claim_id: number; sale_at: string | null; affects_reputation: string | null }

export type ForecastEntry = {
  /** Dia (AAAA-MM-DD, São Paulo). */
  day: string
  date: string
  claims: number[]
  /** Reclamações que ainda contam depois desse dia. */
  remaining: number
}

/**
 * Linha do tempo: as reclamações que contam (affects = affected) e ainda estão no período, agrupadas pelo dia em que
 * saem da conta.
 */
export function buildForecast(claims: readonly ForecastClaim[], periodDays: number | null, now: Date = new Date()): {
  counted: number
  entries: ForecastEntry[]
} {
  const period = periodDays ?? 365
  const counting = claims
    .filter((claim) => claim.affects_reputation === "affected" && claim.sale_at)
    .map((claim) => ({ id: claim.claim_id, leaves: leavesAt(claim.sale_at as string, period) }))
    .filter((claim) => claim.leaves.getTime() > now.getTime())
    .sort((a, b) => a.leaves.getTime() - b.leaves.getTime())

  const entries: ForecastEntry[] = []
  let remaining = counting.length
  for (const claim of counting) {
    const day = dayKey(claim.leaves)
    let entry = entries.at(-1)
    if (!entry || entry.day !== day) {
      entry = { day, date: claim.leaves.toISOString(), claims: [], remaining }
      entries.push(entry)
    }
    entry.claims.push(claim.id)
    remaining--
    entry.remaining = remaining
  }
  return { counted: counting.length, entries }
}

export type AffectsReading = { affects: "affected" | "not_affected" | "not_applies" | null; hasIncentive: boolean | null; dueAt: string | null }

export function readAffects(body: { affects_reputation?: unknown; has_incentive?: unknown; due_date?: unknown } | null): AffectsReading {
  const value = typeof body?.affects_reputation === "string" ? body.affects_reputation : null
  return {
    affects: value === "affected" || value === "not_affected" || value === "not_applies" ? value : null,
    hasIncentive: typeof body?.has_incentive === "boolean" ? body.has_incentive : null,
    dueAt: isoDate(body?.due_date),
  }
}

