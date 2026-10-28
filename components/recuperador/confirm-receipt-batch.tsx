"use client"

import { CheckCircle2Icon, LoaderIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { confirmReceiptBatchAction, type ConfirmReceiptBatchResult } from "@/app/(app)/recuperador/actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ReturnListRow } from "@/lib/dal/recovery"
import { formatMoney } from "@/lib/customers/presentation"
import { formatDateTime } from "@/lib/format"
import { returnHref } from "@/lib/recovery/presentation"

type SelectableRow = Pick<ReturnListRow, "id" | "claim_id" | "item_title" | "amount" | "currency_id" | "deadline_at" | "quick_confirm_available">

/** Seleção explícita para confirmar várias devoluções de uma vez. Nada é enviado sem o clique no diálogo. */
export function ConfirmReceiptBatch({ rows, accountId }: { rows: SelectableRow[]; accountId: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => (checked ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id)))
  }

  const submit = () => {
    const formData = new FormData()
    for (const id of selected) formData.append("returnRowId", id)
    formData.set("confirmed", "true")
    startTransition(async () => {
      const result: ConfirmReceiptBatchResult = await confirmReceiptBatchAction(formData)
      if (result.ok) {
        const successes = result.items.filter((item) => item.status === "ok").length
        toast.success(successes ? `${successes} confirmação${successes === 1 ? "" : "ões"} enviada${successes === 1 ? "" : "s"}.` : result.message)
        setSelected([])
        setConfirmOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
        setConfirmOpen(false)
      }
    })
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Marque as devoluções que chegaram como você enviou.</p>
        <Button type="button" size="sm" disabled={!selected.length || pending} onClick={() => setConfirmOpen(true)}>
          {pending ? <LoaderIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
          {pending ? "Enviando..." : `Confirmar recebimento dos selecionados${selected.length ? ` (${selected.length})` : ""}`}
        </Button>
      </div>
      <ul className="mt-3 divide-y rounded-md border bg-card">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-3 px-3 py-3">
            <Checkbox
              aria-label={`Selecionar ${row.item_title || `devolução ${row.claim_id}`}`}
              checked={selected.includes(row.id)}
              disabled={!row.quick_confirm_available || pending}
              onCheckedChange={(checked) => toggle(row.id, checked === true)}
              className="mt-1"
            />
            <Link href={returnHref(row.id, accountId)} className="min-w-0 flex-1 space-y-1 hover:underline">
              <span className="block truncate text-sm font-medium">{row.item_title || `Devolução ${row.claim_id}`}</span>
              <span className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>#{row.claim_id}</span>
                {row.amount ? <span>{formatMoney(row.amount, row.currency_id)}</span> : null}
                {row.deadline_at ? <span>Até {formatDateTime(row.deadline_at)}</span> : null}
              </span>
              {!row.quick_confirm_available ? <Badge variant="outline">Atualize antes de confirmar</Badge> : null}
            </Link>
          </li>
        ))}
      </ul>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => (pending ? null : setConfirmOpen(open))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Vou avisar ao Mercado Livre que {selected.length} {selected.length === 1 ? "devolução chegou certinho" : "devoluções chegaram certinho"}. Isso não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={submit}>
              {pending ? <LoaderIcon className="animate-spin" data-icon="inline-start" /> : null}
              Sim, confirmar recebimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
