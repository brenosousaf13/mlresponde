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
