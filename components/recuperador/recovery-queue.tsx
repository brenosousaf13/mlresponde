"use client"

import { ArrowUpRightIcon, CheckCircle2Icon, CircleAlertIcon, Clock3Icon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ConfirmReceiptBatch } from "@/components/recuperador/confirm-receipt-batch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RecoveryScreenData, ReviewQueueItem } from "@/lib/recovery/contract"
import { formatMoney } from "@/lib/customers/presentation"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type QueueGroup = "recover" | "confirm_receipt"

function shortDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
}

function deadlineTone(value: string | null, now: number) {
  if (!value) return "neutral"
  const days = Math.ceil((Date.parse(value) - now) / 86_400_000)
  if (days <= 2) return "urgent"
  if (days <= 5) return "soon"
  return "neutral"
}

function DeadlineChip({ item, now }: { item: ReviewQueueItem; now: number }) {
  const tone = deadlineTone(item.deadlineAt, now)
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2 text-[0.7rem] font-medium",
        tone === "urgent" && "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
        tone === "soon" && "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        tone === "neutral" && "bg-muted/60 text-muted-foreground"
      )}
    >
      <Clock3Icon data-icon="inline-start" />
      {item.deadlineAt ? `Prazo ${shortDate(item.deadlineAt)}` : "Sem prazo"}
      {item.deadlineEstimated ? " · estimado" : ""}
    </Badge>
  )
}

function RecoverRow({ item, now }: { item: ReviewQueueItem; now: number }) {
  const value = item.recoverableAmount ?? item.amount
  return (
    <li className="group rounded-xl border border-brand-teal/20 bg-card p-4 shadow-sm transition hover:border-brand-teal/40 hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground" title={item.title ?? undefined}>{item.title || `Devolução #${item.claimId}`}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">#{item.claimId} · {value === null ? "valor a conferir" : formatMoney(value, item.currencyId)}</p>
            </div>
            {value !== null ? <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground sm:text-xl">{formatMoney(value, item.currencyId)}</span> : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <DeadlineChip item={item} now={now} />
            <Badge className="h-6 max-w-full rounded-full bg-brand-teal/12 px-2 text-[0.7rem] text-brand-teal-ink hover:bg-brand-teal/12">
              <span className="truncate">{item.suggestionLabel}</span>
            </Badge>
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={item.reasonShort}>— {item.reasonShort}</span>
          </div>
        </div>
        <Link
          href={item.href}
          className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
        >
          Revisar
          <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>
    </li>
  )
}

function EmptyGroup({ group }: { group: QueueGroup }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      {group === "recover" ? <CheckCircle2Icon className="size-8 text-brand-teal" /> : <CircleAlertIcon className="size-8 text-muted-foreground" />}
      <p className="text-sm font-medium">{group === "recover" ? "Nada pra contestar agora" : "Nenhuma confirmação pendente"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {group === "recover" ? "Quando uma devolução tiver uma ação para recuperar dinheiro, ela aparece aqui." : "As devoluções liberadas para confirmar que chegaram certinho aparecem aqui."}
      </p>
    </div>
  )
}

/** Fila compacta, com recuperar dinheiro sempre antes de confirmar recebimento. */
export function RecoveryQueue({ data, accountId, now }: { data: RecoveryScreenData; accountId: string; now: number }) {
  const [active, setActive] = useState<QueueGroup>(data.groups.recover.count > 0 ? "recover" : "confirm_receipt")
  const recoverRows = data.queue.filter((item) => item.actionGroup === "recover")
  const confirmRows = data.queue.filter((item) => item.actionGroup === "confirm_receipt")

  return (
    <section aria-labelledby="recovery-queue-title" className="space-y-4">
      <Tabs value={active} onValueChange={(value) => setActive(value as QueueGroup)} className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal-ink">Próximas ações</p>
            <h2 id="recovery-queue-title" className="mt-1 text-xl font-semibold tracking-tight">Escolha por onde começar</h2>
          </div>
          <TabsList aria-label="Filtrar ações do Recuperador" className="grid h-auto w-full grid-cols-2 p-1 sm:w-auto sm:min-w-[360px]">
            <TabsTrigger value="recover" className="min-h-10 px-3 py-2">Dá pra recuperar ({formatNumber(data.groups.recover.count)})</TabsTrigger>
            <TabsTrigger value="confirm_receipt" className="min-h-10 px-3 py-2">Só confirmar recebimento ({formatNumber(data.groups.confirmReceipt.count)})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="recover">
          {recoverRows.length ? <ul className="flex flex-col gap-3">{recoverRows.map((item) => <RecoverRow key={item.id} item={item} now={now} />)}</ul> : <EmptyGroup group="recover" />}
        </TabsContent>
        <TabsContent value="confirm_receipt">
          {confirmRows.length ? <ConfirmReceiptBatch rows={confirmRows} accountId={accountId} /> : <EmptyGroup group="confirm_receipt" />}
        </TabsContent>
      </Tabs>
    </section>
  )
}
