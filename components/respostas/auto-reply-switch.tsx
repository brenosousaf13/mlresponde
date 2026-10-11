"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { setAutoReply } from "@/app/(app)/respostas/actions"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"

export function AutoReplySwitch({
  accountId,
  enabled,
  disabled,
}: {
  accountId: string
  enabled: boolean
  disabled?: boolean
}) {
  const [optimistic, setOptimistic] = useOptimistic(enabled)
  const [pending, startTransition] = useTransition()

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={`auto-${accountId}`}>
          {optimistic ? "Respostas automáticas ligadas" : "Respostas automáticas pausadas"}
        </FieldLabel>
        <FieldDescription>
          {optimistic
            ? "A IA responde sozinha quando tem certeza. O resto fica em Perguntas para você."
            : "Nenhuma resposta é enviada sozinha. Todas as perguntas ficam para você responder."}
        </FieldDescription>
      </FieldContent>
      <Switch
        id={`auto-${accountId}`}
        checked={optimistic}
        disabled={disabled || pending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setOptimistic(checked)
            try {
              const result = await setAutoReply(accountId, checked)
              if (result.ok) toast.success(result.message)
              else toast.error(result.message)
            } catch {
              toast.error("Não foi possível alterar agora.")
            }
          })
        }
      />
    </Field>
  )
}
