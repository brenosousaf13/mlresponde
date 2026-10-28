import { ArrowRightIcon, Clock3Icon } from "lucide-react"
import Link from "next/link"

import type { RecoveryQueueGroups } from "@/lib/recovery/contract"
import { formatMoney } from "@/lib/customers/presentation"
import { formatNumber } from "@/lib/format"

function dateLabel(value: string | null, estimated: boolean) {
  if (!value) return "sem prazo informado"
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  return `${date}${estimated ? " · estimado" : ""}`
}

/** Faixa curta de ação; recuperar dinheiro sempre tem prioridade sobre confirmar recebimento. */
export function ReviewBanner({ groups, href }: { groups: RecoveryQueueGroups; href: string }) {
  const recover = groups.recover
  const confirm = groups.confirmReceipt
  if (!recover.count && !confirm.count) return null

  const text = recover.count
    ? `${formatNumber(recover.count)} ${recover.count === 1 ? "devolução dá" : "devoluções dão"} pra recuperar ${formatMoney(recover.amount)} · prazo ${dateLabel(recover.nextDeadlineAt, recover.nextDeadlineEstimated)}`
    : `${formatNumber(confirm.count)} ${confirm.count === 1 ? "devolução" : "devoluções"} só para confirmar recebimento · prazo ${dateLabel(confirm.nextDeadlineAt, confirm.nextDeadlineEstimated)}`

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-teal/20 bg-brand-teal/10 px-3 py-2.5 text-sm text-brand-teal-ink sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-center gap-2 font-medium">
        <Clock3Icon className="size-4 shrink-0" />
        <span className="truncate">{text}</span>
      </p>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
        Ver agora <ArrowRightIcon className="size-3.5" />
      </Link>
    </div>
  )
}
