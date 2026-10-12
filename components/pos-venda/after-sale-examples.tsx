"use client"

import { GraduationCapIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useActionState, useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import { addAfterSaleExample, deleteAfterSaleExample } from "@/app/(app)/pos-venda/actions"
import { FormMessage, SubmitButton, fieldErrors } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

export type AfterSaleExampleRow = { id: string; buyer_message: string; answer_text: string }

export function AfterSaleExamples({ accountId, examples, canManage }: { accountId: string; examples: AfterSaleExampleRow[]; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(addAfterSaleExample, {})
  const [deleting, startDeleting] = useTransition()
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) form.current?.reset()
  }, [state])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {canManage ? (
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Ensinar uma resposta</CardTitle>
            <CardDescription>Quando chegar uma mensagem parecida, o agente usa esta resposta como referência.</CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={form} action={formAction}>
              <input type="hidden" name="accountId" value={accountId} />
              <FieldGroup>
                <FormMessage state={state} />
                <Field>
                  <FieldLabel htmlFor="buyerMessage">Mensagem do comprador</FieldLabel>
                  <Textarea id="buyerMessage" name="buyerMessage" rows={3} maxLength={2000} placeholder="Ex.: Quando meu pedido vai ser enviado?" />
                  <FieldError errors={fieldErrors(state, "buyerMessage")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="answer">Resposta da loja</FieldLabel>
                  <Textarea
                    id="answer"
                    name="answer"
                    rows={4}
                    maxLength={350}
                    placeholder="Ex.: Olá! Despachamos em até 1 dia útil após a confirmação do pagamento. O rastreio aparece em Minhas compras assim que o pacote for postado."
                  />
                  <FieldDescription>Até 350 caracteres, sem telefone, e-mail ou links.</FieldDescription>
                  <FieldError errors={fieldErrors(state, "answer")} />
                </Field>
                <div>
                  <SubmitButton pending={pending} pendingLabel="Salvando...">
                    <PlusIcon data-icon="inline-start" />
                    Ensinar
                  </SubmitButton>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className={canManage ? undefined : "xl:col-span-2"}>
        <CardHeader>
          <CardTitle>Respostas ensinadas</CardTitle>
          <CardDescription>
            Também entram aqui as respostas que você envia em Pós-venda com &ldquo;Ensinar o agente&rdquo; marcado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {examples.length ? (
            <ul className="flex flex-col divide-y rounded-xl border">
              {examples.map((example) => (
                <li key={example.id} className="flex items-start gap-3 p-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Comprador:</span> {example.buyer_message}
                    </p>
                    <p>
                      <span className="font-medium">Loja:</span> {example.answer_text}
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover resposta ensinada"
                      disabled={deleting}
                      onClick={() =>
                        startDeleting(async () => {
                          const result = await deleteAfterSaleExample(example.id)
                          if (result.ok) toast.success(result.message)
                          else toast.error(result.message)
                        })
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GraduationCapIcon />
                </EmptyMedia>
                <EmptyTitle>Nenhuma resposta ensinada ainda</EmptyTitle>
                <EmptyDescription>Ensine as respostas que a sua loja mais usa no pós-venda.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
