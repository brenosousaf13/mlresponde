/** Como cada pergunta aparece no painel (puro: usado nas telas e testado). */

import { REVIEW_REASON_LABELS, type ReviewReason } from "@/lib/answers/decision"

export type QuestionTone = "open" | "queue" | "ai" | "manual" | "external" | "archived"

export function questionTone(status: string, source: string | null): QuestionTone {
  switch (status) {
    case "needs_review":
    case "failed":
      return "open"
    case "pending":
    case "processing":
      return "queue"
    case "answered":
      return source === "ai" ? "ai" : source === "external" ? "external" : "manual"
    case "answered_outside":
      return "external"
    default:
      return "archived"
  }
}

export const TONE_STYLES: Record<
  QuestionTone,
  { label: string; dot: string; text: string; bubble: string; soft: string }
> = {
  open: {
    label: "Para você responder",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bubble: "",
    soft: "bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-100",
  },
  queue: {
    label: "IA analisando",
    dot: "bg-sky-500 animate-pulse",
    text: "text-sky-700 dark:text-sky-400",
    bubble: "",
    soft: "bg-sky-50 border-sky-200 text-sky-950 dark:bg-sky-950/30 dark:border-sky-900 dark:text-sky-100",
  },
  ai: {
    label: "Respondida pela IA",
    dot: "bg-primary",
    text: "text-primary",
    bubble: "bg-primary/10 text-foreground",
    soft: "",
  },
  manual: {
    label: "Respondida por você",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bubble: "bg-emerald-50 text-foreground dark:bg-emerald-950/40",
    soft: "",
  },
  external: {
    label: "Respondida no Mercado Livre",
    dot: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-400",
    bubble: "bg-teal-50 text-foreground dark:bg-teal-950/40",
    soft: "",
  },
  archived: {
    label: "Arquivada",
    dot: "bg-zinc-400",
    text: "text-muted-foreground",
    bubble: "",
    soft: "bg-muted border-border text-muted-foreground",
  },
}

export const INBOX_TABS = {
  responder: { label: "Para responder", hint: "esperando você" },
  ia: { label: "Respondidas pela IA", hint: "sem você precisar fazer nada" },
  voce: { label: "Respondidas por você", hint: "no painel ou no Mercado Livre" },
  todas: { label: "Todas", hint: "inclui na fila e arquivadas" },
} as const

export type InboxTab = keyof typeof INBOX_TABS

const LEGACY_TABS: Record<string, InboxTab> = { revisar: "responder", respondidas: "ia" }

export function parseInboxTab(value: unknown): InboxTab {
  if (typeof value !== "string") return "responder"
  if (value in INBOX_TABS) return value as InboxTab
  return LEGACY_TABS[value] ?? "responder"
}

/** Limpa o texto de busca para usar com segurança num filtro `or` do PostgREST. */
export function sanitizeSearch(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[,()*%\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

/** Resumo de uma linha da lista: rótulo colorido + prévia da resposta (quando houver). */
export function questionSummary(question: {
  status: string
  answer_source: string | null
  review_reason: string | null
  answer_text: string | null
}): { tone: QuestionTone; label: string; preview: string | null } {
  const tone = questionTone(question.status, question.answer_source)
  const preview = question.answer_text?.replace(/\s+/g, " ").trim() || null
  switch (tone) {
    case "open":
      return {
        tone,
        label: (question.review_reason && REVIEW_REASON_LABELS[question.review_reason as ReviewReason]) || TONE_STYLES.open.label,
        preview: null,
      }
    case "ai":
      return { tone, label: "IA", preview }
    case "manual":
      return { tone, label: "Você", preview }
    case "external":
      return { tone, label: "No Mercado Livre", preview }
    default:
      return { tone, label: TONE_STYLES[tone].label, preview: null }
  }
}

export const INBOX_ORDERS = {
  recentes: { label: "Mais recentes primeiro", short: "Mais recentes" },
  antigas: { label: "Mais antigas primeiro", short: "Mais antigas" },
} as const

export type InboxOrder = keyof typeof INBOX_ORDERS

export function parseInboxOrder(value: unknown): InboxOrder {
  return value === "antigas" ? "antigas" : "recentes"
}

const ITEM_ID = /^[A-Z]{3}[0-9]{6,15}$/

/** Código de anúncio do Mercado Livre (ex.: MLB1234567890) vindo da URL; qualquer outra coisa é ignorada. */
export function parseItemFilter(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim().toUpperCase()
  return ITEM_ID.test(id) ? id : null
}

export function parsePage(value: unknown): number {
  const page = Number.parseInt(typeof value === "string" ? value : "1", 10)
  return Number.isFinite(page) && page > 1 ? Math.min(page, 100_000) : 1
}

/** Estado da caixa de entrada que vive na URL de /perguntas. */
export type InboxState = {
  tab: InboxTab
  account: string | null
  item: string | null
  search: string
  order: InboxOrder
  page: number
  question: string | null
}

/** Monta a URL de /perguntas omitindo o que é padrão (aba "Para responder", página 1, mais recentes). */
export function inboxHref(state: InboxState): string {
  const query = new URLSearchParams()
  if (state.tab !== "responder") query.set("aba", state.tab)
  if (state.account) query.set("conta", state.account)
  if (state.item) query.set("anuncio", state.item)
  if (state.search) query.set("busca", state.search)
  if (state.order !== "recentes") query.set("ordem", state.order)
  if (state.page > 1) query.set("pagina", String(state.page))
  if (state.question) query.set("q", state.question)
  const value = query.toString()
  return value ? `/perguntas?${value}` : "/perguntas"
}

/** "1–50 de 1.234": faixa exibida na página atual. */
export function pageRange(page: number, pageSize: number, total: number) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return { from, to, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

export type TopItem = { itemId: string; title: string | null; thumbnail: string | null; total: number; open: number }

/** Agrupa as perguntas por anúncio e devolve os mais perguntados (puro, testado). */
export function rankTopItems(
  rows: { item_id: string | null; item_title: string | null; item_thumbnail: string | null; status: string }[],
  limit = 5
): TopItem[] {
  const byItem = new Map<string, TopItem>()
  for (const row of rows) {
    if (!row.item_id) continue
    const entry = byItem.get(row.item_id) ?? { itemId: row.item_id, title: null, thumbnail: null, total: 0, open: 0 }
    entry.total += 1
    if (row.status === "needs_review" || row.status === "failed") entry.open += 1
    entry.title ??= row.item_title
    entry.thumbnail ??= row.item_thumbnail
    byItem.set(row.item_id, entry)
  }
  return [...byItem.values()].sort((a, b) => b.total - a.total || b.open - a.open).slice(0, limit)
}
