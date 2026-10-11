"use client"

import { BanIcon, Trash2Icon } from "lucide-react"
import { useActionState, useTransition } from "react"
import { toast } from "sonner"

import { addBlacklistItem, removeBlacklistItem } from "@/app/(app)/assistente/actions"
import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export type BlacklistEntry = { id: string; item_id: string; item_title: string | null }

export function BlacklistManager({
  accountId,
  items,
  canManage,
}: {
  accountId: string
  items: BlacklistEntry[]
  canManage: boolean
}) {
  const [state, formAction, pending] = useActionState(addBlacklistItem, {})
  const [removing, startRemoving] = useTransition()

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <form action={formAction} className="flex flex-col gap-3" key={state.ok ? state.message : "form"}>
          <input type="hidden" name="accountId" value={accountId} />
          <FormMessage state={state} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Field className="flex-1" data-invalid={hasFieldError(state, "item") || undefined}>
              <Input
                name="item"
                placeholder="Código (MLB...) ou link do anúncio"
                aria-label="Código ou link do anúncio"
                defaultValue={state.ok ? "" : state.values?.item}
                aria-invalid={hasFieldError(state, "item") || undefined}
                className="bg-card"
              />
              <FieldError errors={fieldErrors(state, "item")} />
            </Field>
            <SubmitButton pending={pending} pendingLabel="Bloqueando...">
              Bloquear anúncio
            </SubmitButton>
          </div>
        </form>
      ) : null}
      {items.length ? (
        <div className="flex flex-col divide-y rounded-xl border bg-card">
          {items.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <BanIcon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-1 text-sm font-medium">{entry.item_title ?? entry.item_id}</p>
                <p className="text-xs text-muted-foreground">{entry.item_id}</p>
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() =>
                    startRemoving(async () => {
                      const result = await removeBlacklistItem(entry.id)
                      if (result.ok) toast.success(result.message)
                      else toast.error(result.message)
                    })
                  }
                >
                  <Trash2Icon data-icon="inline-start" />
                  Desbloquear
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BanIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum anúncio bloqueado</EmptyTitle>
            <EmptyDescription>A IA pode responder perguntas de todos os seus anúncios.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
