"use client"

import { Badge } from "@/components/ui/badge"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { composeAnswer } from "@/lib/answers/compose"
import { CONFIDENCE_PRESETS, TONE_OPTIONS } from "@/lib/answers/decision"

export type StyleValues = { tone: string; greeting: string; signature: string; threshold: string }

const TONE_EXAMPLES: Record<string, string> = {
  cordial: "Temos sim! A cor azul está disponível para envio imediato.",
  profissional: "Sim, a cor azul está disponível em estoque.",
  descontraido: "Temos sim, e a azul fica linda! Pode garantir a sua.",
}

export function ToneOptions({
  value,
  onChange,
  name,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
}) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(String(next))} name={name} disabled={disabled}>
      {TONE_OPTIONS.map((option) => (
        <FieldLabel key={option.value} htmlFor={`tone-${option.value}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{option.label}</FieldTitle>
              <FieldDescription>&ldquo;{TONE_EXAMPLES[option.value]}&rdquo;</FieldDescription>
            </FieldContent>
            <RadioGroupItem value={option.value} id={`tone-${option.value}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}

export function ThresholdOptions({
  value,
  onChange,
  name,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
}) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(String(next))} name={name} disabled={disabled}>
      {CONFIDENCE_PRESETS.map((preset) => (
        <FieldLabel key={preset.value} htmlFor={`threshold-${preset.value}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                {preset.label}
                {preset.value === "0.75" ? <Badge variant="secondary">Recomendado</Badge> : null}
              </FieldTitle>
              <FieldDescription>{preset.description}</FieldDescription>
            </FieldContent>
            <RadioGroupItem value={preset.value} id={`threshold-${preset.value}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}

export function AffixesFields({
  greeting,
  signature,
  onChange,
  disabled,
  errors,
}: {
  greeting: string
  signature: string
  onChange: (next: { greeting: string; signature: string }) => void
  disabled?: boolean
  errors?: { greeting?: React.ReactNode; signature?: React.ReactNode }
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="greeting">Saudação</FieldLabel>
          <Input
            id="greeting"
            name="greeting"
            value={greeting}
            onChange={(event) => onChange({ greeting: event.target.value, signature })}
            maxLength={200}
            placeholder="Olá! Obrigado pelo contato."
            disabled={disabled}
          />
          {errors?.greeting}
        </Field>
        <Field>
          <FieldLabel htmlFor="signature">Assinatura</FieldLabel>
          <Input
            id="signature"
            name="signature"
            value={signature}
            onChange={(event) => onChange({ greeting, signature: event.target.value })}
            maxLength={200}
            placeholder="Equipe Casa da Bike, à disposição!"
            disabled={disabled}
          />
          {errors?.signature}
        </Field>
      </div>
      <div className="rounded-xl border bg-muted/40 p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Assim o comprador vai ver</p>
        <p className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-primary/10 px-3.5 py-2.5 text-sm text-foreground">
          {composeAnswer({ greeting, body: "Sim, temos na cor azul com estoque disponível.", signature })}
        </p>
      </div>
    </div>
  )
}
