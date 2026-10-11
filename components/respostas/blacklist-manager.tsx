"use client"

import { BanIcon, Trash2Icon } from "lucide-react"
import { useActionState, useTransition } from "react"
import { toast } from "sonner"

import { addBlacklistItem, removeBlacklistItem } from "@/app/(app)/respostas/actions"
import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"

export type BlacklistEntry = { id: string; item_id: string; item_title: string | null }

export function BlacklistManager({ accountId, items }: { accountId: string; items: BlacklistEntry[] }) {
  const [state, formAction, pending] = useActionState(addBlacklistItem, {})
  const [removing, startRemoving] = useTransition()

  return (
    <div className="flex flex-col gap-4">
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
            />
            <FieldError errors={fieldErrors(state, "item")} />
          </Field>
          <SubmitButton pending={pending} variant="outline" pendingLabel="Adicionando...">
            Adicionar
          </SubmitButton>
        </div>
      </form>
      {items.length ? (
        <ItemGroup className="gap-2">
          {items.map((entry) => (
            <Item key={entry.id} variant="outline" size="sm">
              <ItemMedia variant="icon">
                <BanIcon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-1">{entry.item_title ?? entry.item_id}</ItemTitle>
                <ItemDescription>{entry.item_id}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${entry.item_id}`}
                  disabled={removing}
                  onClick={() =>
                    startRemoving(async () => {
                      const result = await removeBlacklistItem(entry.id)
                      if (result.ok) toast.success(result.message)
                      else toast.error(result.message)
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum anúncio na lista. A IA pode responder todos.</p>
      )}
    </div>
  )
}
