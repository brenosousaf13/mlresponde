"use client"

import { PencilIcon } from "lucide-react"
import { useActionState, useState } from "react"
import { toast } from "sonner"

import { updateOrganization } from "@/app/admin/actions"
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toDateInput } from "@/lib/admin/format"
import { SUBSCRIPTION_STATUSES } from "@/lib/admin/labels"
import { PLANS } from "@/lib/plans/plans"
import type { FormState } from "@/lib/validation/forms"

export type SubscriptionValues = {
  id: string
  name: string
  plan: string | null
  subscription_status: string
  trial_ends_at: string
  current_period_end: string | null
  billing_exempt: boolean
  ml_accounts_limit: number
  monthly_price: number | null
  ml_active: number
}

const NO_PLAN = "sem-plano"
const PLAN_ITEMS = [{ value: NO_PLAN, label: "Sem plano" }, ...Object.values(PLANS).map((plan) => ({ value: plan.id, label: plan.name }))]
const STATUS_ITEMS = Object.entries(SUBSCRIPTION_STATUSES).map(([value, label]) => ({ value, label }))

/** Editar assinatura e dados da loja (plano, situação, datas, cortesia, limite de contas, mensalidade). */
export function OrgSubscriptionDialog({ values }: { values: SubscriptionValues }) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState(values.plan ?? NO_PLAN)
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    formData.set("plan", plan === NO_PLAN ? "" : plan)
    const result = await updateOrganization(values.id, previous, formData)
    if (result.ok) {
      toast.success(result.message ?? "Salvo.")
      setOpen(false)
    }
    return result
  }, {})
  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]?.length) || undefined

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setPlan(values.plan ?? NO_PLAN)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PencilIcon data-icon="inline-start" />
        Editar assinatura
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assinatura de {values.name}</DialogTitle>
          <DialogDescription>
            Tudo o que mudar aqui fica no histórico. O acesso do cliente segue a situação: em teste até a data do fim do
            teste, liberado se ativa ou cortesia, bloqueado nos outros casos.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor="org-name">Nome da loja</FieldLabel>
              <Input id="org-name" name="name" defaultValue={values.name} maxLength={120} required aria-invalid={invalid("name")} />
              <FieldError errors={fieldErrors(state, "name")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("plan")}>
                <FieldLabel htmlFor="org-plan">Plano</FieldLabel>
                <Select items={PLAN_ITEMS} value={plan} onValueChange={(next) => setPlan(String(next ?? NO_PLAN))}>
                  <SelectTrigger id="org-plan" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>O plano Administração libera tudo: só para contas internas.</FieldDescription>
                <FieldError errors={fieldErrors(state, "plan")} />
              </Field>
              <Field data-invalid={invalid("subscription_status")}>
                <FieldLabel htmlFor="org-status">Situação da assinatura</FieldLabel>
                <Select name="subscription_status" items={STATUS_ITEMS} defaultValue={values.subscription_status}>
                  <SelectTrigger id="org-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={fieldErrors(state, "subscription_status")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("trial_ends_at")}>
                <FieldLabel htmlFor="org-trial">Fim do teste</FieldLabel>
                <Input id="org-trial" name="trial_ends_at" type="date" defaultValue={toDateInput(values.trial_ends_at)} required />
                <FieldError errors={fieldErrors(state, "trial_ends_at")} />
              </Field>
              <Field data-invalid={invalid("current_period_end")}>
                <FieldLabel htmlFor="org-period">Pago até</FieldLabel>
                <Input id="org-period" name="current_period_end" type="date" defaultValue={toDateInput(values.current_period_end)} />
                <FieldDescription>Opcional (controle manual até o gateway existir).</FieldDescription>
                <FieldError errors={fieldErrors(state, "current_period_end")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("monthly_price")}>
                <FieldLabel htmlFor="org-price">Mensalidade</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>R$</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="org-price"
                    name="monthly_price"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={values.monthly_price !== null ? String(values.monthly_price).replace(".", ",") : ""}
                    aria-invalid={invalid("monthly_price")}
                  />
                </InputGroup>
                <FieldDescription>Entra no MRR quando a situação é &quot;Ativa&quot;.</FieldDescription>
                <FieldError errors={fieldErrors(state, "monthly_price")} />
              </Field>
              <Field data-invalid={invalid("ml_accounts_limit")}>
                <FieldLabel htmlFor="org-limit">Limite de contas do ML ativas</FieldLabel>
                <Input
                  id="org-limit"
                  name="ml_accounts_limit"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={values.ml_accounts_limit}
                  aria-invalid={invalid("ml_accounts_limit")}
                />
                <FieldDescription>Hoje {values.ml_active} ativa(s). Baixar o limite não desativa contas.</FieldDescription>
                <FieldError errors={fieldErrors(state, "ml_accounts_limit")} />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox id="org-exempt" name="billing_exempt" value="on" defaultChecked={values.billing_exempt} />
              <FieldLabel htmlFor="org-exempt" className="font-normal">
                Cortesia: acesso liberado sem cobrança (ignora teste e situação)
              </FieldLabel>
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
