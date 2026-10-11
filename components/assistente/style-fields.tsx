"use client"

import { RotateCcwIcon, ShieldCheckIcon, ZapIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { composeAnswer } from "@/lib/answers/compose"
import {
  CONFIDENCE_PRESETS,
  DEFAULT_FALLBACK_ANSWER,
  FALLBACK_ANSWER_LIMIT,
  TONE_OPTIONS,
  fallbackBody,
} from "@/lib/answers/decision"

export type StyleValues = {
  tone: string
  greeting: string
  signature: string
  threshold: string
  /** "careful" (o que a IA não souber fica para você) ou "always" (responde sempre). */
  mode: string
  /** Mensagem padrão do modo "sempre" (sem saudação e assinatura). */
  fallback: string
}

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
  mode,
}: {
  value: string
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
  mode?: string
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
              <FieldDescription>{mode === "always" ? preset.alwaysDescription : preset.description}</FieldDescription>
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

/** Chave do modo "responder sempre" + a mensagem padrão (com prévia) quando ele está ligado. */
export function ModeFields({
  mode,
  fallback,
  greeting,
  signature,
  onChange,
  disabled,
  error,
}: {
  mode: string
  fallback: string
  greeting: string
  signature: string
  onChange: (next: { mode: string; fallback: string }) => void
  disabled?: boolean
  error?: React.ReactNode
}) {
  const always = mode === "always"
  const isDefault = fallback.replace(/\s+/g, " ").trim() === DEFAULT_FALLBACK_ANSWER

  return (
    <div className="flex flex-col gap-5">
      <FieldLabel htmlFor="answer-mode">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>
              <ZapIcon className="size-4 text-violet-600 dark:text-violet-400" />
              Responder sempre
            </FieldTitle>
            <FieldDescription>
              {always
                ? "Toda pergunta recebe resposta na hora. Quando a IA não tiver a informação, ela envia a mensagem padrão abaixo."
                : "Desligado: o que a IA não souber fica para você responder, já com um rascunho. Ligue se prefere rapidez a uma resposta completa."}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="answer-mode"
            checked={always}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ mode: checked ? "always" : "careful", fallback })}
          />
        </Field>
      </FieldLabel>

      {always ? (
        <div className="grid animate-in gap-5 duration-200 fade-in lg:grid-cols-2">
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="fallback">Mensagem quando a IA não souber</FieldLabel>
              {!isDefault && !disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ mode, fallback: DEFAULT_FALLBACK_ANSWER })}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Usar a sugerida
                </Button>
              ) : null}
            </div>
            <Textarea
              id="fallback"
              value={fallback}
              onChange={(event) => onChange({ mode, fallback: event.target.value })}
              rows={4}
              maxLength={FALLBACK_ANSWER_LIMIT}
              disabled={disabled}
            />
            <FieldDescription>
              Saudação e assinatura entram sozinhas. Sem telefone, e-mail ou links. {fallback.length}/{FALLBACK_ANSWER_LIMIT}
            </FieldDescription>
            {error}
          </Field>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Assim o comprador vai ver quando a IA não souber</p>
              <p className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-violet-500/10 px-3.5 py-2.5 text-sm text-foreground">
                {composeAnswer({ greeting, body: fallbackBody(fallback), signature })}
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border p-3.5 text-sm text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>
                A IA continua sem inventar nada. Pedido de desconto recebe &ldquo;as condições são as do anúncio&rdquo;,
                reclamação recebe um pedido de desculpas com o caminho de &ldquo;Minhas compras&rdquo;. Anúncios bloqueados
                continuam ficando para você.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}