import type { ClaimRisk } from "@/lib/reputation/claim-ai"
import type { ShipmentRisk } from "@/lib/reputation/shipments"
import type { Band, ReputationColor } from "@/lib/reputation/thresholds"

/** Textos e cores das telas do Escudo de Reputação (puro). As cores do termômetro são as do ML, não da marca. */

/** Do pior para o melhor, como o termômetro do ML. */
export const THERMOMETER: readonly { color: Exclude<ReputationColor, "none">; label: string; className: string }[] = [
  { color: "red", label: "Vermelho", className: "bg-red-500" },
  { color: "orange", label: "Laranja", className: "bg-orange-500" },
  { color: "yellow", label: "Amarelo", className: "bg-yellow-400" },
  { color: "light_green", label: "Verde-claro", className: "bg-lime-500" },
  { color: "green", label: "Verde", className: "bg-emerald-600" },
]

export const COLOR_TITLES: Record<ReputationColor, string> = {
  green: "Verde",
  light_green: "Verde-claro",
  yellow: "Amarelo",
  orange: "Laranja",
  red: "Vermelho",
  none: "Sem cor ainda",
}

export const COLOR_BADGE: Record<ReputationColor, string> = {
  green: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  light_green: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  yellow: "bg-yellow-400/20 text-yellow-800 dark:text-yellow-200",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  none: "bg-muted text-muted-foreground",
}

export const BAND_BAR: Record<Band, string> = {
  green: "bg-emerald-600",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
}

export const POWER_SELLER_LABELS: Record<string, string> = {
  silver: "MercadoLíder",
  gold: "MercadoLíder Gold",
  platinum: "MercadoLíder Platinum",
}

export function powerSellerLabel(status: string | null | undefined): string | null {
  if (!status) return null
  return POWER_SELLER_LABELS[status] ?? "MercadoLíder"
}

/** 0,02 → "2%"; 0,045 → "4,5%"; 0,0912 → "9,1%". */
export function formatRate(rate: number): string {
  const percent = Math.round(rate * 1000) / 10
  return (Number.isInteger(percent) ? String(percent) : percent.toFixed(1)).replace(".", ",") + "%"
}

export const RISK_LABELS: Record<ShipmentRisk, string> = {
  late: "Atrasado",
  at_risk: "Vence logo",
  on_time: "No prazo",
  no_deadline: "Sem prazo informado",
}

export const RISK_BADGE: Record<ShipmentRisk, string> = {
  late: "bg-red-500/10 text-red-700 dark:text-red-300",
  at_risk: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  on_time: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  no_deadline: "bg-muted text-muted-foreground",
}

/** Ordem da lista de despachos: atrasados, que vencem logo, no prazo e sem prazo. */
export const RISK_ORDER: Record<ShipmentRisk, number> = { late: 0, at_risk: 1, on_time: 2, no_deadline: 3 }

/** Link da venda na área do vendedor do Mercado Livre. */
export function mlSaleUrl(orderId: number | string | null | undefined): string | null {
  if (!orderId) return null
  return "https://www.mercadolivre.com.br/vendas/" + encodeURIComponent(String(orderId)) + "/detalhe"
}

export const LOGISTIC_LABELS: Record<string, string> = {
  drop_off: "Agência",
  xd_drop_off: "Agência",
  cross_docking: "Coleta",
  self_service: "Flex",
  fulfillment: "Full",
  default: "Mercado Envios",
}

export function logisticLabel(type: string | null | undefined): string | null {
  if (!type) return null
  return LOGISTIC_LABELS[type] ?? null
}

// ---------------------------------------------------------------------------------------------- reclamações

/** Selo "afeta / não afeta a reputação" (resposta de /claims/{id}/affects-reputation). */
export function affectsInfo(value: string | null | undefined): { label: string; className: string } {
  if (value === "affected") return { label: "Afeta a reputação", className: "bg-red-500/10 text-red-700 dark:text-red-300" }
  if (value === "not_affected") {
    return { label: "Não afeta a reputação", className: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300" }
  }
  if (value === "not_applies") return { label: "Não conta na reputação", className: "bg-muted text-muted-foreground" }
  return { label: "Conferindo a reputação", className: "bg-muted text-muted-foreground" }
}

export const CLAIM_RISK_BADGE: Record<ClaimRisk, string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
  medium: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  low: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
}

/** Prazo da próxima ação: vencido, vence em até 24 h ou com folga. */
export function dueState(dueAt: string | null | undefined, now: Date): "overdue" | "soon" | "later" | "none" {
  if (!dueAt) return "none"
  const due = Date.parse(dueAt)
  if (!Number.isFinite(due)) return "none"
  if (due <= now.getTime()) return "overdue"
  return due - now.getTime() <= 24 * 60 * 60 * 1000 ? "soon" : "later"
}

export const DUE_TEXT: Record<"overdue" | "soon" | "later" | "none", string> = {
  overdue: "text-red-700 dark:text-red-300",
  soon: "text-amber-800 dark:text-amber-200",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
}

/** Página da reclamação dentro da maanu. */
export function claimHref(claimRowId: string, accountId?: string | null): string {
  return "/reputacao/reclamacoes/" + claimRowId + (accountId ? "?conta=" + encodeURIComponent(accountId) : "")
}


export const SHIPPING_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  handling: "Em preparação",
  ready_to_ship: "Pronto para despachar",
  shipped: "A caminho",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  cancelled: "Cancelado",
}

/** Quem precisa agir agora na reclamação (campo action_responsible do ML). */
export function actionResponsibleLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const labels: Record<string, string> = {
    seller: "Você",
    respondent: "Você",
    buyer: "O comprador",
    complainant: "O comprador",
    mediator: "O Mercado Livre",
  }
  return labels[value] ?? null
}

/** Mensagem moderada pelo ML (não chegou ao destinatário ou ainda está em análise). */
export function moderationLabel(status: string | null | undefined): string | null {
  if (status === "rejected") return "Bloqueada pelo Mercado Livre"
  if (status === "pending") return "Em análise pelo Mercado Livre"
  return null
}
