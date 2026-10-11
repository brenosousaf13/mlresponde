"use client"

import { useActionState, useState } from "react"

import { updateAnswerSettings } from "@/app/(app)/respostas/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { composeAnswer } from "@/lib/answers/compose"
import { CONFIDENCE_PRESETS, TONE_OPTIONS } from "@/lib/answers/decision"

const BRIEFING_PLACEHOLDER = [
  "Ex.:",
  "- Enviamos em até 1 dia útil após a confirmação do pagamento.",
  "- Todos os produtos têm nota fiscal e garantia de 90 dias.",
  "- Trocas em até 7 dias, com o produto sem uso e na embalagem original.",
  "- Não fazemos retirada no local.",
].join("\n")

export type AnswerSettings = {
  accountId: string
  threshold: string
  tone: string
  greeting: string
  signature: string
  briefing: string
}

export function AnswerSettingsForm({ settings }: { settings: AnswerSettings }) {
  const [state, formAction, pending] = useActionState(updateAnswerSettings, {})
  const [threshold, setThreshold] = useState(state.values?.threshold ?? settings.threshold)
  const [tone, setTone] = useState(state.values?.tone ?? settings.tone)
  const [greeting, setGreeting] = useState(settings.greeting)
  const [signature, setSignature] = useState(settings.signature)
  const [briefing, setBriefing] = useState(settings.briefing)
  const preset = CONFIDENCE_PRESETS.find((item) => item.value === threshold)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="accountId" value={settings.accountId} />
      <input type="hidden" name="threshold" value={threshold} />
      <input type="hidden" name="tone" value={tone} />
      <FormMessage state={state} />
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={hasFieldError(state, "threshold") || undefined}>
            <FieldLabel>Quando a IA responde sozinha</FieldLabel>
            <Select
              items={CONFIDENCE_PRESETS.map((item) => ({ value: item.value, label: item.label }))}
              value={threshold}
              onValueChange={(value) => value && setThreshold(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONFIDENCE_PRESETS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{preset?.description}</FieldDescription>
            <FieldError errors={fieldErrors(state, "threshold")} />
          </Field>
          <Field data-invalid={hasFieldError(state, "tone") || undefined}>
            <FieldLabel>Tom das respostas</FieldLabel>
            <Select
              items={TONE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={tone}
              onValueChange={(value) => value && setTone(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Como a IA escreve para os compradores.</FieldDescription>
            <FieldError errors={fieldErrors(state, "tone")} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={hasFieldError(state, "greeting") || undefined}>
            <FieldLabel htmlFor="greeting">Saudação</FieldLabel>
            <Input
              id="greeting"
              name="greeting"
              value={greeting}
              onChange={(event) => setGreeting(event.target.value)}
              maxLength={200}
              placeholder="Olá! Obrigado pelo contato."
            />
            <FieldError errors={fieldErrors(state, "greeting")} />
          </Field>
          <Field data-invalid={hasFieldError(state, "signature") || undefined}>
            <FieldLabel htmlFor="signature">Assinatura</FieldLabel>
            <Input
              id="signature"
              name="signature"
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
              maxLength={200}
              placeholder="Equipe Casa da Bike. Aguardamos sua compra!"
            />
            <FieldError errors={fieldErrors(state, "signature")} />
          </Field>
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Exemplo de resposta</p>
          <p>
            {composeAnswer({
              greeting,
              body: "Sim, temos na cor azul a pronta entrega.",
              signature,
            })}
          </p>
        </div>
        <FieldSeparator />
        <Field data-invalid={hasFieldError(state, "briefing") || undefined}>
          <FieldLabel htmlFor="briefing">Informações da loja</FieldLabel>
          <Textarea
            id="briefing"
            name="briefing"
            value={briefing}
            onChange={(event) => setBriefing(event.target.value)}
            rows={8}
            maxLength={5000}
            placeholder={BRIEFING_PLACEHOLDER}
          />
          <FieldDescription>
            Regras que valem para todos os anúncios: prazo de envio, garantia, trocas, nota fiscal, horário de
            atendimento. Informações de um produto específico ficam melhor na descrição do anúncio. {briefing.length}/5000
          </FieldDescription>
          <FieldError errors={fieldErrors(state, "briefing")} />
        </Field>
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar configurações
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  )
}
