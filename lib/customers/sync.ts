/**
 * Conferência periódica das vendas da aba Clientes (puro, testado em tests/unit/customers.test.ts).
 *
 * Sem importação do histórico (decisão do Breno, 2026-10-19): cada conta conta as compras a partir de
 * ml_customer_sync.tracking_since. A conferência pede ao ML só as vendas criadas desde então e alteradas desde a última
 * conferência (o banco ainda descarta qualquer venda mais antiga em ingest_ml_orders).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const POLL_PAGE_SIZE = 50
/** Conferência das vendas novas ou alteradas, por conta (espelho do intervalo em public.claim_customer_sync). */
export const POLL_INTERVAL_MINUTES = 10
/** A conferência volta um pouco antes da última, para não perder venda alterada no meio da consulta anterior. */
export const POLL_OVERLAP_MS = 5 * 60 * 1000
/** Se o ML recusar o filtro por data de atualização, a conferência lê as vendas criadas nos últimos dias. */
export const POLL_FALLBACK_DAYS = 3
export const MAX_POLL_PAGES = 4

function iso(time: number) {
  return new Date(time).toISOString()
}

function parsed(value: string | null | undefined, fallback: number) {
  const time = Date.parse(value ?? "")
  return Number.isFinite(time) ? time : fallback
}

/** Filtros do /orders/search da conferência: criadas desde o início da contagem e alteradas desde a última conferência. */
export function pollFilters(lastPolledAt: string | null, trackingSince: string, now: Date): { createdFrom: string; updatedFrom: string } {
  const since = Math.min(parsed(trackingSince, now.getTime()), now.getTime())
  const last = Math.min(parsed(lastPolledAt, since), now.getTime())
  return { createdFrom: iso(since), updatedFrom: iso(Math.max(since, last - POLL_OVERLAP_MS)) }
}

/** Plano B (filtro de atualização recusado): vendas criadas nos últimos dias, nunca antes do início da contagem. */
export function pollFallbackSince(trackingSince: string, now: Date): string {
  return iso(Math.max(parsed(trackingSince, now.getTime()), now.getTime() - POLL_FALLBACK_DAYS * DAY_MS))
}

/** Data no formato dos filtros do /orders/search (ex.: 2026-10-01T00:00:00.000-00:00). */
export function mlDateParam(value: string | Date): string {
  return new Date(value).toISOString().replace("Z", "-00:00")
}
