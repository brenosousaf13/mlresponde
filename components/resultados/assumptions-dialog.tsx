"use client"

import { CalculatorIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateAssumptions, type AssumptionsResult } from "@/app/(app)/resultados/actions"
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
import { Spinner } from "@/components/ui/spinner"
import { formatCurrency } from "@/lib/results/format"
import { ASSUMPTION_LIMITS, type Assumptions } from "@/lib/results/metrics"

const toText = (value: number) => String(value).replace(".", ",")
const toNumber = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."))

export function AssumptionsDialog({
  assumptions,
  canEdit,
  triggerClassName,
}: {
  assumptions: Assumptions
  canEdit: boolean
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(toText(assumptions.minutesPerAnswer))
  const [cost, setCost] = useState(toText(assumptions.hourlyCost))
  const [result, setResult] = useState<AssumptionsResult | null>(null)
  const [pending, startTransition] = useTransition()

  const minutesValue = toNumber(minutes)
  const costValue = toNumber(cost)
  const perAnswer = Number.isFinite(minutesValue) && Number.isFinite(costValue) ? (minutesValue / 60) * costValue : null

  function reset(next: Assumptions) {
    setMinutes(toText(next.minutesPerAnswer))
    setCost(toText(next.hourlyCost))
    setResult(null)
  }

  function save() {
    startTransition(async () => {
      const response = await updateAssumptions({ minutesPerAnswer: minutes, hourlyCost: cost })
      setResult(response)
      if (response.ok) {
        toast.success(response.message ?? "Cálculo atualizado.")
        setOpen(false)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset(assumptions)
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className={triggerClassName} />}>
        <CalculatorIcon data-icon="inline-start" />
        Ajustar cálculo
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como calculamos a economia</DialogTitle>
          <DialogDescription>
            Cada pergunta que a IA responde sozinha é um atendimento que você não precisou fazer. Ajuste os números
            para a realidade da sua loja.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (canEdit) save()
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(result?.fieldErrors?.minutesPerAnswer) || undefined}>
              <FieldLabel htmlFor="assumption-minutes">Tempo para responder uma pergunta</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="assumption-minutes"
                  inputMode="decimal"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  disabled={!canEdit || pending}
                  aria-invalid={Boolean(result?.fieldErrors?.minutesPerAnswer) || undefined}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>min</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Ler a pergunta, conferir o anúncio e o estoque e escrever a resposta.</FieldDescription>
              <FieldError>{result?.fieldErrors?.minutesPerAnswer}</FieldError>
            </Field>
            <Field data-invalid={Boolean(result?.fieldErrors?.hourlyCost) || undefined}>
              <FieldLabel htmlFor="assumption-cost">Custo da hora de atendimento</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>R$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="assumption-cost"
                  inputMode="decimal"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  disabled={!canEdit || pending}
                  aria-invalid={Boolean(result?.fieldErrors?.hourlyCost) || undefined}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>por hora</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Quanto custa a hora de quem responde: um atendente com encargos fica perto de R$ 20. Se é você quem
                responde, use o valor da sua hora.
              </FieldDescription>
              <FieldError>{result?.fieldErrors?.hourlyCost}</FieldError>
            </Field>
          </FieldGroup>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {perAnswer !== null && perAnswer > 0 ? (
              <>
                Cada resposta da IA vale <span className="font-medium text-foreground">{formatCurrency(perAnswer)}</span>{" "}
                do seu tempo.
              </>
            ) : (
              "Preencha os dois campos para ver o valor de cada resposta."
            )}
          </p>
          {result && !result.ok && result.message ? <p className="text-sm text-destructive">{result.message}</p> : null}
          {canEdit ? null : (
            <p className="text-sm text-muted-foreground">Só o dono ou um administrador pode alterar esses números.</p>
          )}
          <DialogFooter>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={() =>
                  reset({
                    minutesPerAnswer: ASSUMPTION_LIMITS.minutesPerAnswer.default,
                    hourlyCost: ASSUMPTION_LIMITS.hourlyCost.default,
                  })
                }
                disabled={pending}
              >
                Usar o padrão
              </Button>
            ) : null}
            <DialogClose render={<Button type="button" variant="outline" />}>{canEdit ? "Cancelar" : "Fechar"}</DialogClose>
            {canEdit ? (
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Salvar
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}