import type { FollowUpTone } from "@/lib/recovery/follow-up"
import type { PhotoReviewVerdict } from "@/lib/recovery/photo-review"
import type { ReturnPhase, ReviewMode } from "@/lib/recovery/returns"
import type { SuggestedAction } from "@/lib/recovery/suggest"
import type { QueueRecommendation } from "@/lib/recovery/contract"

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

/** Selo da ação sugerida pela IA (só tokens do tema/tons já usados no Recuperador). */
export const SUGGESTION_BADGE: Record<SuggestedAction, string> = {
  contest: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  do_not_contest: "bg-muted text-muted-foreground",
  partial_refund: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
}

/** Cores da recomendação curta que aparece em cada linha da lista. */
export const RECOMMENDATION_BADGE: Record<QueueRecommendation, string> = {
  contestar: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ressarcimento_parcial: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ressarcimento_total: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  chegou_certinho: "bg-muted text-muted-foreground",
}

export const RECOMMENDATION_LABEL: Record<QueueRecommendation, string> = {
  contestar: "Dá para contestar",
  ressarcimento_parcial: "Pedir ressarcimento parcial",
  ressarcimento_total: "Pedir ressarcimento total",
  chegou_certinho: "Chegou certinho",
}

/** Caixa do resultado da conferência das fotos. */
export const PHOTO_VERDICT_BOX: Record<PhotoReviewVerdict, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/5",
  needs_more: "border-amber-500/40 bg-amber-500/5",
  unusable: "border-red-500/40 bg-red-500/5",
}

/** Caixa e selo do acompanhamento depois do envio. */
export const FOLLOW_UP_BOX: Record<FollowUpTone, string> = {
  info: "border-primary/40 bg-primary/5",
  success: "border-emerald-500/40 bg-emerald-500/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  neutral: "",
}

export const FOLLOW_UP_BADGE: Record<FollowUpTone, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
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
