"use client"

import { Settings2Icon } from "lucide-react"
import { useActionState, useState } from "react"
import { toast } from "sonner"

import { updateFinanceSettings } from "@/app/admin/actions"
import { fieldErrors, FormMessage, SubmitButton } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import type { FormState } from "@/lib/validation/forms"

const toText = (value: number) => String(value).replace(".", ",")

/** Cotação do dólar (para converter o custo da OpenAI) e custos fixos mensais da plataforma. */
export function FinanceSettingsDialog({ rate, fixedCosts }: { rate: number; fixedCosts: number }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await updateFinanceSettings(previous, formData)
    if (result.ok) {
      toast.success(result.message ?? "Salvo.")
      setOpen(false)
    }
    return result
  }, {})
  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]?.length) || undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2Icon data-icon="inline-start" />
        Ajustar números
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Premissas do financeiro</DialogTitle>
          <DialogDescription>Valem para todo o painel. A mudança fica registrada no histórico.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={invalid("usd_brl_rate")}>
              <FieldLabel htmlFor="usd-rate">Cotação do dólar</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>R$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="usd-rate" name="usd_brl_rate" inputMode="decimal" defaultValue={toText(rate)} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>por US$ 1</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>A OpenAI cobra em dólar (no cartão entra IOF; dá para somar aqui).</FieldDescription>
              <FieldError errors={fieldErrors(state, "usd_brl_rate")} />
            </Field>
            <Field data-invalid={invalid("monthly_fixed_costs_brl")}>
              <FieldLabel htmlFor="fixed-costs">Custos fixos por mês</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>R$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="fixed-costs"
                  name="monthly_fixed_costs_brl"
                  inputMode="decimal"
                  defaultValue={toText(fixedCosts)}
                />
              </InputGroup>
              <FieldDescription>Vercel, Supabase, domínio, e-mail... Entra na margem estimada.</FieldDescription>
              <FieldError errors={fieldErrors(state, "monthly_fixed_costs_brl")} />
            </Field>
          </FieldGroup>
          <FormMessage state={state.ok ? {} : state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <SubmitButton pending={pending} pendingLabel="Salvando...">
              Salvar
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
