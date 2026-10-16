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
import { BILLING_CYCLE_LABELS, PLANS, sellablePlan, type BillingCycle } from "@/lib/plans/plans"
import { formatNumber } from "@/lib/format"
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
  /** null = o limite do plano. */
  monthly_answers_limit: number | null
  billing_cycle: BillingCycle | null
}

const NO_PLAN = "sem-plano"
const PLAN_ITEMS = [{ value: NO_PLAN, label: "Sem plano" }, ...Object.values(PLANS).map((plan) => ({ value: plan.id, label: plan.name }))]
const STATUS_ITEMS = Object.entries(SUBSCRIPTION_STATUSES).map(([value, label]) => ({ value, label }))
const NO_CYCLE = "sem-ciclo"
const CYCLE_ITEMS = [
  { value: NO_CYCLE, label: "Sem assinatura" },
  ...Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => ({ value, label })),
]

function priceText(value: number | null) {
  return value === null ? "" : value.toFixed(2).replace(".", ",")
}

/** Editar assinatura e dados da loja (plano, situação, datas, cortesia, limite de contas, mensalidade). */
export function OrgSubscriptionDialog({ values }: { values: SubscriptionValues }) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState(values.plan ?? NO_PLAN)
  const [cycle, setCycle] = useState<string>(values.billing_cycle ?? NO_CYCLE)
  const [accountsLimit, setAccountsLimit] = useState(String(values.ml_accounts_limit))
  const [price, setPrice] = useState(priceText(values.monthly_price))
  const [answersLimit, setAnswersLimit] = useState(values.monthly_answers_limit === null ? "" : String(values.monthly_answers_limit))
  const selected = PLANS[plan] ?? null
  const planAnswers = selected?.limits.answersPerMonth

  /** Plano vendido escolhido: preenche contas e mensalidade com os valores dele (dá para ajustar depois). */
  function applyPlan(nextPlan: string, nextCycle: string) {
    const sellable = sellablePlan(nextPlan)
    if (!sellable) return
    setAccountsLimit(String(sellable.limits.mlAccounts))
    if (nextCycle === NO_CYCLE) setCycle("monthly")
    setPrice(priceText(sellable.priceMonthly))
  }

  function reset() {
    setPlan(values.plan ?? NO_PLAN)
    setCycle(values.billing_cycle ?? NO_CYCLE)
    setAccountsLimit(String(values.ml_accounts_limit))
    setPrice(priceText(values.monthly_price))
    setAnswersLimit(values.monthly_answers_limit === null ? "" : String(values.monthly_answers_limit))
  }

  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    formData.set("plan", plan === NO_PLAN ? "" : plan)
    formData.set("billing_cycle", cycle === NO_CYCLE ? "" : cycle)
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
        if (next) reset()
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
                <Select
                  items={PLAN_ITEMS}
                  value={plan}
                  onValueChange={(next) => {
                    const value = String(next ?? NO_PLAN)
                    setPlan(value)
                    applyPlan(value, cycle)
                  }}
                >
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
                <FieldDescription>
                  Escolher um plano preenche contas e mensalidade. &quot;Sem plano&quot; = teste grátis (tudo do Pro, 1 conta). Administração: só contas internas.
                </FieldDescription>
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
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
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
                  value={accountsLimit}
                  onChange={(event) => setAccountsLimit(event.target.value)}
                  aria-invalid={invalid("ml_accounts_limit")}
                />
                <FieldDescription>
                  Hoje {values.ml_active} ativa(s). Baixar o limite desativa as contas mais novas acima dele.
                </FieldDescription>
                <FieldError errors={fieldErrors(state, "ml_accounts_limit")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("billing_cycle")}>
                <FieldLabel htmlFor="org-cycle">Ciclo de cobrança</FieldLabel>
                <Select
                  items={CYCLE_ITEMS}
                  value={cycle}
                  onValueChange={(next) => {
                    const value = String(next ?? NO_CYCLE)
                    setCycle(value)
                    if (value !== NO_CYCLE) applyPlan(plan, value)
                  }}
                >
                  <SelectTrigger id="org-cycle" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>A maanu só vende o plano mensal.</FieldDescription>
                <FieldError errors={fieldErrors(state, "billing_cycle")} />
              </Field>
              <Field data-invalid={invalid("monthly_answers_limit")}>
                <FieldLabel htmlFor="org-answers">Respostas automáticas por mês</FieldLabel>
                <Input
                  id="org-answers"
                  name="monthly_answers_limit"
                  inputMode="numeric"
                  placeholder={
                    planAnswers === undefined
                      ? "Do plano"
                      : planAnswers === null
                        ? "Do plano: sem limite"
                        : `Do plano: ${formatNumber(planAnswers)}`
                  }
                  value={answersLimit}
                  onChange={(event) => setAnswersLimit(event.target.value)}
                  aria-invalid={invalid("monthly_answers_limit")}
                />
                <FieldDescription>Vazio = o limite do plano. Use para um acordo especial.</FieldDescription>
                <FieldError errors={fieldErrors(state, "monthly_answers_limit")} />
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
