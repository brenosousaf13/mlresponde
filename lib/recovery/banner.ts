import { pluralize } from "@/lib/format"
import type { RecoveryQueueGroups } from "@/lib/recovery/contract"

type BannerInput =
  | { groups: RecoveryQueueGroups }
  | { count: number; amount: number; nextDeadline: string | null }

function groupsFromLegacy(input: BannerInput): RecoveryQueueGroups {
  if ("groups" in input) return input.groups
  return {
    recover: {
      count: input.count,
      amount: input.amount,
      nextDeadlineAt: input.nextDeadline,
      nextDeadlineEstimated: false,
    },
    confirmReceipt: { count: 0, nextDeadlineAt: null, nextDeadlineEstimated: false },
  }
}

function dateLabel(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
}

function deadlineText(value: string | null): string {
  const date = dateLabel(value)
  return date ? "vence " + date : ""
}

/** Título do banner do Recuperador, priorizando o grupo que recupera dinheiro. */
export function reviewBannerText(input: BannerInput): string | null {
  if (!("groups" in input)) {
    if (input.count <= 0) return null
    const parts = [pluralize(input.count, "devolução pra revisar", "devoluções pra revisar")]
    if (input.amount > 0) parts.push(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amount))
    if (input.nextDeadline) {
      const date = dateLabel(input.nextDeadline)
      if (date) parts.push((input.count === 1 ? "vence em " : "a primeira vence em ") + date)
    }
    return parts.join(" · ")
  }
  const groups = groupsFromLegacy(input)
  if (groups.recover.count > 0) {
    const parts = [pluralize(groups.recover.count, "caso pra recuperar", "casos pra recuperar"), new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(groups.recover.amount)]
    const deadline = deadlineText(groups.recover.nextDeadlineAt)
    if (deadline) parts.push(deadline)
    return parts.join(" · ")
  }
  if (groups.confirmReceipt.count > 0) {
    const parts = [pluralize(groups.confirmReceipt.count, "devolução só pra confirmar recebimento", "devoluções só pra confirmar recebimento")]
    const deadline = deadlineText(groups.confirmReceipt.nextDeadlineAt)
    if (deadline) parts.push(deadline)
    return parts.join(" · ")
  }
  return null
}

/** Texto secundário do banner quando ainda há confirmações depois dos casos de recuperação. */
export function reviewBannerSecondary(input: BannerInput): string | null {
  const groups = groupsFromLegacy(input)
  if (groups.recover.count > 0 && groups.confirmReceipt.count > 0) {
    return "+ " + groups.confirmReceipt.count + " " + (groups.confirmReceipt.count === 1 ? "só pra confirmar recebimento" : "só pra confirmar recebimento")
  }
  return null
}

/** Quantidade do selo do menu: recover primeiro; se vazio, confirmações. */
export function recoveryBadgeCount(groups: RecoveryQueueGroups): number {
  return groups.recover.count || groups.confirmReceipt.count
}
