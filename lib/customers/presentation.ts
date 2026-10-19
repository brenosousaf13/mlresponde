/** Como a aba Clientes aparece no painel (puro: usado nas telas e testado em tests/unit/customers.test.ts). */

import { isPurchase } from "@/lib/customers/orders"

export const CUSTOMERS_PAGE_SIZE = 50
/** "Novos": primeira compra nos últimos 30 dias (o mesmo de public.customers_overview). */
export const NEW_CUSTOMER_DAYS = 30
export const NOTE_MAX_LENGTH = 2000

export const CUSTOMER_FILTERS = {
  todos: { label: "Todos" },
  voltaram: { label: "Voltaram a comprar" },
  uma: { label: "Uma compra" },
  novos: { label: "Novos (30 dias)" },
} as const

export type CustomerFilter = keyof typeof CUSTOMER_FILTERS

export const CUSTOMER_ORDERS = {
  recentes: { label: "Última compra", hint: "mais recentes primeiro" },
  compras: { label: "Mais compras", hint: "quem mais comprou primeiro" },
  total: { label: "Maior total", hint: "quem mais gastou primeiro" },
  antigos: { label: "Primeira compra", hint: "clientes mais antigos primeiro" },
} as const

export type CustomerOrder = keyof typeof CUSTOMER_ORDERS

export function parseCustomerFilter(value: unknown): CustomerFilter {
  return typeof value === "string" && value in CUSTOMER_FILTERS ? (value as CustomerFilter) : "todos"
}

export function parseCustomerOrder(value: unknown): CustomerOrder {
  return typeof value === "string" && value in CUSTOMER_ORDERS ? (value as CustomerOrder) : "recentes"
}

/** Coluna e direção de cada ordem (o desempate é sempre a última compra mais recente). */
export const CUSTOMER_ORDER_COLUMNS: Record<CustomerOrder, { column: "last_order_at" | "purchases_count" | "total_spent" | "first_order_at"; ascending: boolean }> = {
  recentes: { column: "last_order_at", ascending: false },
  compras: { column: "purchases_count", ascending: false },
  total: { column: "total_spent", ascending: false },
  antigos: { column: "first_order_at", ascending: true },
}

/** Estado da lista de clientes que vive na URL de /clientes. */
export type CustomersState = {
  account: string | null
  search: string
  filter: CustomerFilter
  order: CustomerOrder
  page: number
}

/** Monta a URL de /clientes omitindo o que é padrão (todas as contas, sem busca, todos, última compra, página 1). */
export function customersHref(state: CustomersState): string {
  const query = new URLSearchParams()
  if (state.account) query.set("conta", state.account)
  if (state.search) query.set("q", state.search)
  if (state.filter !== "todos") query.set("filtro", state.filter)
  if (state.order !== "recentes") query.set("ordem", state.order)
  if (state.page > 1) query.set("pagina", String(state.page))
  const value = query.toString()
  return value ? "/clientes?" + value : "/clientes"
}

/** Início do período de "Novos" (primeira compra a partir desta data). */
export function newCustomersSince(now: Date = new Date()): string {
  return new Date(now.getTime() - NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** Filtro or do PostgREST para a busca por nome ou apelido. O texto já deve vir limpo por sanitizeSearch. */
export function customerSearchFilter(search: string): string | null {
  const text = search.trim()
  if (!text) return null
  return "nickname.ilike.%" + text + "%,full_name.ilike.%" + text + "%"
}

type CustomerName = { full_name?: string | null; nickname?: string | null; buyer_id?: number | null }

/** Nome para mostrar: nome e sobrenome; sem eles, o apelido; sem nada, o número do comprador. */
export function customerDisplayName(customer: CustomerName): string {
  return customer.full_name?.trim() || customer.nickname?.trim() || (customer.buyer_id ? "Comprador " + customer.buyer_id : "Comprador")
}

/** "Belo Horizonte/MG", só a cidade, só a UF ou null. */
export function customerLocation(city: string | null | undefined, state: string | null | undefined): string | null {
  const parts = [city?.trim(), state?.trim()].filter(Boolean)
  return parts.length ? parts.join("/") : null
}

/** Iniciais para o avatar ("Maria Silva" → "MS"; "LOJA123" → "LO"). */
export function customerInitials(customer: CustomerName): string {
  const name = customerDisplayName(customer)
  const words = name.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?"
}

/** Clientes que voltaram a comprar, em % (sem casas decimais). */
export function returningRate(customers: number, returning: number): number {
  return customers > 0 ? Math.round((returning / customers) * 100) : 0
}

export type CustomersOverview = { customers: number; returning: number; totalSpent: number; new30d: number }

/** Lê o JSON de public.customers_overview (tolerante a campos faltando). */
export function readCustomersOverview(value: unknown): CustomersOverview {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const number = (key: string) => {
    const parsed = Number(data[key])
    return Number.isFinite(parsed) ? parsed : 0
  }
  return { customers: number("customers"), returning: number("returning"), totalSpent: number("total_spent"), new30d: number("new_30d") }
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: "Paga",
  partially_paid: "Paga em parte",
  partially_refunded: "Devolução parcial",
  cancelled: "Cancelada",
  invalid: "Inválida",
  pending_cancel: "Cancelando",
  payment_required: "Aguardando pagamento",
  payment_in_process: "Pagamento em análise",
  confirmed: "Aguardando pagamento",
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

export type PurchaseTone = "paid" | "partial" | "cancelled" | "pending"

export function purchaseTone(status: string): PurchaseTone {
  if (status === "paid") return "paid"
  if (status === "partially_paid" || status === "partially_refunded") return "partial"
  if (status === "cancelled" || status === "invalid") return "cancelled"
  return "pending"
}

export type CustomerOrderRow = {
  ml_order_id: number
  pack_id: number | null
  status: string
  ordered_at: string | null
  total_amount: number | null
  currency_id: string | null
  mediations_count: number
  items: unknown
}

export type PurchaseItem = { id: string | null; title: string; variation: string | null; quantity: number }

export type Purchase = {
  /** Número que identifica a compra no ML: o pack, ou a venda quando não há pack. */
  key: number
  orderIds: number[]
  orderedAt: string | null
  items: PurchaseItem[]
  total: number
  currency: string
  /** Situação que resume a compra (a "pior" situação válida, ou a da primeira venda). */
  status: string
  valid: boolean
  hasClaim: boolean
}

function readItems(value: unknown): PurchaseItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): PurchaseItem[] => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Produto"
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1
    return [
      {
        id: typeof item.id === "string" ? item.id : null,
        title,
        variation: typeof item.variation === "string" && item.variation.trim() ? item.variation.trim() : null,
        quantity,
      },
    ]
  })
}

const STATUS_PRIORITY = ["partially_refunded", "partially_paid", "paid", "pending_cancel", "payment_in_process", "payment_required", "confirmed", "cancelled", "invalid"]

function summaryStatus(statuses: string[]): string {
  const valid = statuses.filter(isPurchase)
  const pool = valid.length ? valid : statuses
  return [...pool].sort((a, b) => {
    const ia = STATUS_PRIORITY.indexOf(a)
    const ib = STATUS_PRIORITY.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })[0] ?? "paid"
}

/** Junta as vendas do mesmo pack numa compra (como o comprador vê no ML) e ordena da mais recente para a mais antiga. */
export function groupPurchases(orders: readonly CustomerOrderRow[]): Purchase[] {
  const groups = new Map<number, CustomerOrderRow[]>()
  for (const order of orders) {
    const key = order.pack_id ?? order.ml_order_id
    groups.set(key, [...(groups.get(key) ?? []), order])
  }
  const purchases = [...groups.entries()].map(([key, rows]): Purchase => {
    const sorted = [...rows].sort((a, b) => a.ml_order_id - b.ml_order_id)
    const validRows = sorted.filter((row) => isPurchase(row.status))
    const dates = sorted.map((row) => row.ordered_at).filter((date): date is string => Boolean(date)).sort()
    return {
      key,
      orderIds: sorted.map((row) => row.ml_order_id),
      orderedAt: dates[0] ?? null,
      items: sorted.flatMap((row) => readItems(row.items)),
      total: Math.round((validRows.length ? validRows : sorted).reduce((sum, row) => sum + (row.total_amount ?? 0), 0) * 100) / 100,
      currency: sorted.find((row) => row.currency_id)?.currency_id ?? "BRL",
      status: summaryStatus(sorted.map((row) => row.status)),
      valid: validRows.length > 0,
      hasClaim: sorted.some((row) => row.mediations_count > 0),
    }
  })
  return purchases.sort((a, b) => (b.orderedAt ?? "").localeCompare(a.orderedAt ?? "") || b.key - a.key)
}

/** Texto das observações: tira espaços das pontas e confere o tamanho. */
export function normalizeNote(value: unknown): { ok: true; note: string } | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "Escreva as observações em texto." }
  const note = value.replace(/\r\n/g, "\n").trim()
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, message: "Use no máximo " + NOTE_MAX_LENGTH.toLocaleString("pt-BR") + " caracteres." }
  }
  return { ok: true, note }
}

const currencyFormats = new Map<string, Intl.NumberFormat>()

/** R$ 1.234,56 (outras moedas também funcionam). */
export function formatMoney(value: number, currency: string | null | undefined = "BRL"): string {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : "BRL"
  let format = currencyFormats.get(code)
  if (!format) {
    format = new Intl.NumberFormat("pt-BR", { style: "currency", currency: code })
    currencyFormats.set(code, format)
  }
  return format.format(value)
}

export type SyncSummary = {
  importing: boolean
  failed: { accountId: string; nickname: string; message: string | null }[]
  ordersImported: number
}

/** Situação da importação das contas mostradas (só as contas que podem sincronizar entram em "importando"). */
export function summarizeSync(
  rows: readonly { ml_account_id: string; status: string; orders_imported: number; last_error: string | null }[],
  accounts: readonly { id: string; nickname: string; usable: boolean }[]
): SyncSummary {
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const summary: SyncSummary = { importing: false, failed: [], ordersImported: 0 }
  for (const row of rows) {
    const account = byId.get(row.ml_account_id)
    if (!account) continue
    if ((row.status === "pending" || row.status === "running") && account.usable) {
      summary.importing = true
      summary.ordersImported += row.orders_imported
    }
    if (row.status === "failed") summary.failed.push({ accountId: account.id, nickname: account.nickname, message: row.last_error })
  }
  return summary
}
