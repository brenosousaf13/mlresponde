"use client"

import { KeyRoundIcon, LockKeyholeIcon, PlusIcon } from "lucide-react"
import { useActionState, useState } from "react"
import { toast } from "sonner"

import { addAiKey } from "@/app/admin/(painel)/chaves-ia/actions"
import { fieldErrors, FormMessage, SubmitButton } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { FormState } from "@/lib/validation/forms"

/**
 * Cadastro de chave da OpenAI. A chave vai só para o servidor (Server Action), que testa, criptografa e grava; ela nunca
 * volta para esta tela, nem em caso de erro.
 */
export function AiKeyAddDialog({ hasActive, disabled, model }: { hasActive: boolean; disabled: boolean; model: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await addAiKey(previous, formData)
    if (result.ok) {
      toast.success(result.message ?? "Chave salva.")
      setOpen(false)
    }
    return result
  }, {})
  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]?.length) || undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        <PlusIcon data-icon="inline-start" />
        Cadastrar chave
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-brand-teal-ink" />
            Cadastrar chave da OpenAI
          </DialogTitle>
          <DialogDescription>
            A maanu testa a chave com o modelo {model} antes de salvar. Depois de salva, ela fica criptografada e ninguém vê o
            valor de novo (nem você): aparecem só o nome e os 4 últimos caracteres.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-6" autoComplete="off">
          <FieldGroup>
            <Field data-invalid={invalid("label")}>
              <FieldLabel htmlFor="ai-key-label">Nome</FieldLabel>
              <Input
                id="ai-key-label"
                name="label"
                maxLength={80}
                placeholder="Ex.: Produção out/2026"
                defaultValue={state.values?.label ?? ""}
                aria-invalid={invalid("label")}
                required
              />
              <FieldDescription>Só para você reconhecer. Vale pôr o mês em que ela vence.</FieldDescription>
              <FieldError errors={fieldErrors(state, "label")} />
            </Field>
            <Field data-invalid={invalid("key")}>
              <FieldLabel htmlFor="ai-key-value">Chave</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <LockKeyholeIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="ai-key-value"
                  name="key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  placeholder="sk-proj-..."
                  className="font-mono"
                  aria-invalid={invalid("key")}
                  required
                />
              </InputGroup>
              <FieldDescription>
                Use uma chave de projeto (sk-proj-...) com data de validade e permissão só para gerar respostas. Chaves de
                administração (sk-admin-...) são recusadas.
              </FieldDescription>
              <FieldError errors={fieldErrors(state, "key")} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="ai-key-activate" name="activate" value="on" defaultChecked={!hasActive} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="ai-key-activate" className="font-normal">
                  Usar esta chave agora
                </FieldLabel>
                <FieldDescription>
                  {hasActive
                    ? "A chave em uso hoje vira reserva. Desmarcado, esta entra como reserva."
                    : "Não há chave em uso no painel: a primeira entra em uso de qualquer jeito."}
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>
          <FormMessage state={state.ok ? {} : state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <SubmitButton pending={pending} pendingLabel="Testando a chave...">
              Testar e salvar
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
