"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveCustomerNote } from "@/app/(app)/clientes/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { NOTE_MAX_LENGTH } from "@/lib/customers/presentation"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Observações internas do cliente (só a equipe da loja vê; o comprador não). */
export function CustomerNoteForm({ customerId, initialNote }: { customerId: string; initialNote: string }) {
  const router = useRouter()
  const [note, setNote] = useState(initialNote)
  const [saved, setSaved] = useState(initialNote)
  const [pending, startTransition] = useTransition()
  const changed = note.trim() !== saved.trim()
  const tooLong = note.length > NOTE_MAX_LENGTH

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!changed || tooLong) return
        startTransition(async () => {
          const result = await saveCustomerNote(customerId, note)
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          setSaved(note.trim())
          setNote(note.trim())
          toast.success(result.message)
          router.refresh()
        })
      }}
    >
      <Textarea
        name="notes"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Ex.: prefere tamanho 40, sempre pergunta sobre o prazo, cliente fiel desde 2025."
        rows={5}
        maxLength={NOTE_MAX_LENGTH + 200}
        aria-label="Observações sobre o cliente"
        aria-invalid={tooLong || undefined}
        className="bg-card"
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {formatNumber(note.length)}/{formatNumber(NOTE_MAX_LENGTH)}
        </span>
        <Button type="submit" size="sm" disabled={!changed || tooLong || pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Salvar
        </Button>
      </div>
    </form>
  )
}
