import type { ReturnPhase, ReviewMode } from "@/lib/recovery/returns"

/** Visual do Recuperador (puro). */

export const PHASE_BADGE: Record<ReturnPhase, string> = {
  needs_review: "bg-red-500/10 text-red-700 dark:text-red-300",
  waiting: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  at_warehouse: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  reviewed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
}

/** Rótulo da devolução que espera o vendedor: revisar o pacote que chegou ou contestar o armazém do ML. */
export const MODE_LABELS: Record<ReviewMode, string> = {
  arrival: "Revise agora",
  appeal: "Dá para contestar",
}

/** Texto do prazo na lista e na devolução. */
export function deadlineLabel(mode: ReviewMode | null, overdue: boolean): string {
  if (overdue) return "Prazo venceu "
  return mode === "appeal" ? "Contestar até " : "Revisar até "
}

export function returnHref(returnRowId: string, accountId?: string | null): string {
  return "/recuperador/devolucoes/" + returnRowId + (accountId ? "?conta=" + encodeURIComponent(accountId) : "")
}

export function recoveryHref(accountId: string | null, tab: "visao" | "devolucoes" | "raio-x", filter?: string): string {
  const query = new URLSearchParams()
  if (accountId) query.set("conta", accountId)
  if (tab !== "visao") query.set("aba", tab)
  if (filter && filter !== "revisar") query.set("filtro", filter)
  const search = query.toString()
  return search ? "/recuperador?" + search : "/recuperador"
}

export const BENEFITED_LABELS: Record<string, string> = {
  seller: "Você foi ressarcido",
  both: "Você foi ressarcido (e o comprador também)",
  buyer: "O dinheiro foi para o comprador",
}

/** Situação da revisão/contestação do vendedor (seller_status da documentação do ML). */
export function sellerStatusLabel(status: string | null | undefined, sellerReason: string | null | undefined): string | null {
  if (status === "pending") return "Aguardando a sua revisão ou contestação"
  if (status === "claimed") return "Sua contestação está em análise no ML"
  if (status === "failed") return "O ML deu razão a você"
  if (status === "success") return sellerReason ? "O ML deu razão ao comprador" : "Encerrada sem contestação"
  return null
}

export const DESTINATION_LABELS: Record<string, string> = {
  seller: "voltou para você",
  buyer: "voltou para o comprador",
  meli: "ficou com o Mercado Livre",
}
