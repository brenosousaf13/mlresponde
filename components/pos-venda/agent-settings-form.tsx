"use client"

import { ShieldCheckIcon } from "lucide-react"
import { useActionState, useState } from "react"

import { updateAgentSettings } from "@/app/(app)/pos-venda/actions"
import { FormMessage, SubmitButton, fieldErrors } from "@/components/forms/form-feedback"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { AFTER_SALE_CONFIDENCE_PRESETS, DEFAULT_AFTER_SALE_THRESHOLD, SENSITIVE_POLICIES } from "@/lib/after-sale/decision"
import { AFTER_SALE_INSTRUCTIONS_LIMIT, AFTER_SALE_SIGNATURE_LIMIT, composeAfterSaleMessage } from "@/lib/after-sale/text"

export type AgentSettingsValues = {
  policy: string
  threshold: string
  signature: string
  instructions: string
}

const INSTRUCTIONS_PLACEHOLDER = [
  "Ex.:",
  "Despachamos em até 1 dia útil após o pagamento; pedidos até 13h saem no mesmo dia.",
  "A nota fiscal é enviada junto com o produto e também fica em Minhas compras.",
  "Troca de tamanho: o comprador abre a devolução em Minhas compras e faz um novo pedido.",
  "Produto com defeito: pedimos foto e resolvemos pela devolução do Mercado Livre.",
  "Nunca oferecer desconto nem brinde por atraso.",
].join("\n")

export function AgentSettingsForm({ accountId, initial, disabled }: { accountId: string; initial: AgentSettingsValues; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(updateAgentSettings, {})
  const [values, setValues] = useState(initial)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="policy" value={values.policy} />
      <input type="hidden" name="threshold" value={values.threshold} />
      <FormMessage state={state} />

      <Card>
        <CardHeader>
          <CardTitle>O que o agente sabe sobre a sua loja</CardTitle>
          <CardDescription>
            Ele já usa tudo o que você respondeu na configuração do Assistente de IA (envio, nota fiscal, garantia, trocas e
            atendimento). Aqui você completa com o que vale só para quem já comprou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="instructions">Instruções para o pós-venda</FieldLabel>
            <Textarea
              id="instructions"
              name="instructions"
              value={values.instructions}
              onChange={(event) => setValues({ ...values, instructions: event.target.value })}
              rows={7}
              maxLength={AFTER_SALE_INSTRUCTIONS_LIMIT}
              placeholder={INSTRUCTIONS_PLACEHOLDER}
              disabled={disabled}
            />
            <FieldDescription>
              Prazos de despacho, onde fica a nota fiscal, como a loja resolve trocas e defeitos, o que nunca dizer. Sem telefone,
              e-mail ou links. {values.instructions.length}/{AFTER_SALE_INSTRUCTIONS_LIMIT}
            </FieldDescription>
            <FieldError errors={fieldErrors(state, "instructions")} />
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assuntos delicados</CardTitle>
            <CardDescription>Problemas com o pedido, trocas, devoluções e cancelamentos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RadioGroup value={values.policy} onValueChange={(next) => setValues({ ...values, policy: String(next) })} disabled={disabled}>
              {SENSITIVE_POLICIES.map((policy) => (
                <FieldLabel key={policy.value} htmlFor={`policy-${policy.value}`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>
                        {policy.label}
                        {policy.value === "review" ? <Badge variant="secondary">Recomendado</Badge> : null}
                      </FieldTitle>
                      <FieldDescription>{policy.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={policy.value} id={`policy-${policy.value}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              Mudanças no pedido (endereço, cor, tamanho) e conversas com reclamação aberta sempre ficam com você.
            </p>
            <FieldError errors={fieldErrors(state, "policy")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quanta certeza o agente precisa ter</CardTitle>
            <CardDescription>Abaixo do nível escolhido, a conversa fica para você com um rascunho pronto.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={values.threshold} onValueChange={(next) => setValues({ ...values, threshold: String(next) })} disabled={disabled}>
              {AFTER_SALE_CONFIDENCE_PRESETS.map((preset) => (
                <FieldLabel key={preset.value} htmlFor={`as-threshold-${preset.value}`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>
                        {preset.label}
                        {preset.value === DEFAULT_AFTER_SALE_THRESHOLD ? <Badge variant="secondary">Recomendado</Badge> : null}
                      </FieldTitle>
                      <FieldDescription>{preset.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={preset.value} id={`as-threshold-${preset.value}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            <FieldError errors={fieldErrors(state, "threshold")} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assinatura das mensagens</CardTitle>
          <CardDescription>
            Opcional. Entra no fim das mensagens do agente. O Mercado Livre limita cada mensagem a 350 caracteres, então seja breve.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="signature">Assinatura</FieldLabel>
            <Input
              id="signature"
              name="signature"
              value={values.signature}
              onChange={(event) => setValues({ ...values, signature: event.target.value })}
              maxLength={AFTER_SALE_SIGNATURE_LIMIT}
              placeholder="Equipe Casa da Bike"
              disabled={disabled}
            />
            <FieldError errors={fieldErrors(state, "signature")} />
          </Field>
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Assim o comprador vai ver</p>
            <p className="w-fit max-w-full rounded-2xl rounded-tr-sm bg-primary/10 px-3.5 py-2.5 text-sm">
              {composeAfterSaleMessage(
                "Olá! Seu pedido já foi enviado e o código de rastreio é AA123456789BR. Você acompanha a entrega em Minhas compras.",
                values.signature
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {disabled ? null : (
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar configuração
          </SubmitButton>
        </div>
      )}
    </form>
  )
}
