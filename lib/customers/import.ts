/**
 * Importação dos últimos 12 meses e conferência periódica das vendas (puro, testado em tests/unit/customers.test.ts).
 *
 * A importação vai da janela mais nova para a mais velha, em janelas de 30 dias que se encostam (nenhuma venda fica de
 * fora; as da borda podem vir duas vezes, e a gravação é idempotente). O /orders/search não deixa o offset passar de
 * 10.000 e ordena pela data de fechamento (conferido em 2026-10-19), então não dá para "andar" a janela pela data da
 * venda mais antiga lida: janela com vendas demais é dividida ao meio antes de paginar.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const IMPORT_DAYS = 365
export const IMPORT_WINDOW_DAYS = 30
export const IMPORT_PAGE_SIZE = 50
/** Limite do ML: offset + limit até 10.000 ("limit.maximum_exceeded"). */
export const ML_MAX_OFFSET = 10_000
/** Janela com mais vendas que isto é dividida ao meio (fica abaixo do limite do ML com folga). */
export const MAX_WINDOW_ORDERS = 9_000
/** Janela mínima: abaixo disso não divide mais (loja com mais de 9 mil vendas em 1 hora lê só as primeiras 10 mil). */
export const MIN_WINDOW_MS = 60 * 60 * 1000
/** Falhas seguidas antes de a importação ficar como "falhou" (o cliente pode tentar de novo pela tela). */
export const MAX_IMPORT_ATTEMPTS = 6
/** Conferência das vendas novas ou alteradas, por conta (espelho do intervalo em public.claim_customer_sync). */
export const POLL_INTERVAL_MINUTES = 10
/** A conferência volta um pouco antes da última, para não perder venda alterada no meio da consulta anterior. */
export const POLL_OVERLAP_MS = 5 * 60 * 1000
/** Se o ML recusar o filtro por data de atualização, a conferência lê as vendas criadas nos últimos dias. */
export const POLL_FALLBACK_DAYS = 3
export const MAX_POLL_PAGES = 4

export type ImportCursor = {
  importSince: string
  windowFrom: string
  windowTo: string
  offset: number
}

function iso(time: number) {
  return new Date(time).toISOString()
}

function windowStart(windowTo: number, importSince: number) {
  return Math.max(importSince, windowTo - IMPORT_WINDOW_DAYS * DAY_MS)
}

/** Primeira janela: de hoje até 30 dias atrás; a importação vai até 365 dias atrás. */
export function startImport(now: Date): ImportCursor {
  const to = now.getTime()
  const since = to - IMPORT_DAYS * DAY_MS
  return { importSince: iso(since), windowFrom: iso(windowStart(to, since)), windowTo: iso(to), offset: 0 }
}

/** Cursor gravado no banco (ml_customer_sync) ou o começo da importação. */
export function resumeImport(
  row: { import_since: string | null; window_from: string | null; window_to: string | null; window_offset: number },
  now: Date
): { cursor: ImportCursor; started: boolean } {
  if (row.import_since && row.window_from && row.window_to) {
    return {
      cursor: {
        importSince: row.import_since,
        windowFrom: row.window_from,
        windowTo: row.window_to,
        offset: Math.max(0, row.window_offset),
      },
      started: false,
    }
  }
  return { cursor: startImport(now), started: true }
}

export type ImportPage = {
  /** Vendas recebidas nesta página (inclusive as descartadas por não terem comprador). */
  received: number
  /** paging.total do ML para a janela. */
  total: number
}

/** Próximo passo depois de ler uma página da janela atual. */
export function nextImportCursor(cursor: ImportCursor, page: ImportPage): { done: boolean; cursor: ImportCursor } {
  const from = Date.parse(cursor.windowFrom)
  const to = Date.parse(cursor.windowTo)

  // Vendas demais na janela para o limite de offset do ML: fica com a metade mais nova; a outra metade vira o começo
  // da próxima janela (as vendas desta página voltam na janela menor e são regravadas sem efeito).
  if (cursor.offset === 0 && page.total > MAX_WINDOW_ORDERS && to - from > MIN_WINDOW_MS) {
    return { done: false, cursor: { ...cursor, windowFrom: iso(from + Math.floor((to - from) / 2)), offset: 0 } }
  }

  const offset = cursor.offset + page.received
  const windowEnded =
    page.received === 0 || page.received < IMPORT_PAGE_SIZE || offset >= page.total || offset + IMPORT_PAGE_SIZE > ML_MAX_OFFSET

  if (windowEnded) {
    const since = Date.parse(cursor.importSince)
    if (from <= since) return { done: true, cursor: { ...cursor, offset } }
    return { done: false, cursor: { ...cursor, windowTo: iso(from), windowFrom: iso(windowStart(from, since)), offset: 0 } }
  }
  return { done: false, cursor: { ...cursor, offset } }
}

/** Espera antes de tentar de novo depois de uma falha: 1, 2, 4, 8, 16 e 30 minutos. */
export function importRetryDelayMs(attempts: number): number {
  const minutes = Math.min(30, 2 ** Math.max(0, attempts - 1))
  return minutes * 60 * 1000
}

/** A partir de quando a conferência pede as vendas alteradas. */
export function pollSince(lastPolledAt: string | null, importStartedAt: string | null, now: Date): string {
  const base = Date.parse(lastPolledAt ?? importStartedAt ?? "")
  const from = Number.isFinite(base) ? base : now.getTime() - POLL_FALLBACK_DAYS * DAY_MS
  return iso(Math.min(from, now.getTime()) - POLL_OVERLAP_MS)
}

export function pollFallbackSince(now: Date): string {
  return iso(now.getTime() - POLL_FALLBACK_DAYS * DAY_MS)
}

/** Data no formato dos filtros do /orders/search (ex.: 2026-10-01T00:00:00.000-00:00). */
export function mlDateParam(value: string | Date): string {
  return new Date(value).toISOString().replace("Z", "-00:00")
}
