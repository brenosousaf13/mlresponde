/** Como cada pergunta aparece no painel (puro: usado nas telas e testado). */

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
