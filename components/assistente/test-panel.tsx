"use client"

import { BotIcon, CircleAlertIcon, CircleCheckIcon, FlaskConicalIcon, UserIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { testAssistant, type TestResult } from "@/app/(app)/assistente/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const SUGGESTIONS = ["Vocês emitem nota fiscal?", "Aceita troca se não servir?", "Faz por um preço menor no pix?", "Posso retirar na loja?"]

export function TestPanel({ accountId }: { accountId: string }) {
  const [question, setQuestion] = useState("")
  const [item, setItem] = useState("")
  const [result, setResult] = useState<TestResult | null>(null)
  const [asked, setAsked] = useState("")
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      setAsked(question.trim())
      setResult(await testAssistant(accountId, question, item))
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4 text-primary" />
            Testar a IA
          </CardTitle>
          <CardDescription>
            Faça uma pergunta como se fosse um comprador. Nada é enviado ao Mercado Livre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="test-question">Pergunta do comprador</FieldLabel>
              <Textarea
                id="test-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && question.trim()) run()
                }}
                rows={3}
                maxLength={1000}
                placeholder="Ex.: Vocês emitem nota fiscal?"
              />
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuestion(suggestion)}
                    className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="test-item">Anúncio (opcional)</FieldLabel>
              <Input
                id="test-item"
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder="Código (MLB...) ou link do anúncio"
              />
              <FieldDescription>
                Com um anúncio, a IA também lê a ficha técnica, as variações, o estoque e a descrição dele.
              </FieldDescription>
            </Field>
            <div>
              <Button onClick={run} disabled={pending || question.trim().length < 3}>
                {pending ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                Ver resposta da IA
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="min-h-80">
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
          <CardDescription>Exatamente o que a IA faria com a configuração atual.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {pending ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner /> A IA está lendo as informações da loja...
            </div>
          ) : !result ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Escreva uma pergunta e clique em &ldquo;Ver resposta da IA&rdquo;.
            </div>
          ) : !result.ok ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              {result.message}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-sm",
                  result.wouldAnswer
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                )}
              >
                {result.wouldAnswer ? (
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                )}
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">
                    {result.wouldAnswer ? "A IA responderia sozinha" : "A IA deixaria esta pergunta para você"}
                    {` · certeza ${Math.round(result.confidence * 100)}%`}
                  </p>
                  <p className="opacity-90">{result.reviewLabel ? `${result.reviewLabel}. ` : ""}{result.reason}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserIcon className="size-3.5" />
                  </span>
                  <p className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm">{asked}</p>
                </div>
                {result.text ? (
                  <div className="flex items-start gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <BotIcon className="size-3.5" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <p
                        className={cn(
                          "rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm",
                          result.wouldAnswer ? "bg-primary/10" : "border border-dashed bg-card text-muted-foreground"
                        )}
                      >
                        {result.text}
                      </p>
                      {!result.wouldAnswer ? (
                        <p className="text-xs text-muted-foreground">Rascunho que ficaria para você revisar.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {result.itemTitle ? (
                  <p className="text-xs text-muted-foreground">Anúncio usado no teste: {result.itemTitle}</p>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
