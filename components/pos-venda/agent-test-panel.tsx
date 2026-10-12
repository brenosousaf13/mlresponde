"use client"

import { BotIcon, ChevronDownIcon, CircleAlertIcon, CircleCheckIcon, FlaskConicalIcon, PackageIcon, UserIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { testAfterSaleAgent, type AgentTestResult } from "@/app/(app)/pos-venda/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
  "Meu pedido já foi enviado?",
  "Qual o código de rastreio?",
  "Vocês mandam a nota fiscal?",
  "Chegou com defeito, o que faço?",
  "Posso trocar o tamanho?",
]

export function AgentTestPanel({ accountId }: { accountId: string }) {
  const [message, setMessage] = useState("")
  const [sale, setSale] = useState("")
  const [asked, setAsked] = useState("")
  const [result, setResult] = useState<AgentTestResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      setAsked(message.trim())
      setResult(await testAfterSaleAgent(accountId, message, sale))
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4 text-primary" />
            Testar o agente
          </CardTitle>
          <CardDescription>Escreva como se fosse um comprador. Nada é enviado ao Mercado Livre.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="as-test-message">Mensagem do comprador</FieldLabel>
              <Textarea
                id="as-test-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && message.trim()) run()
                }}
                rows={3}
                maxLength={2000}
                placeholder="Ex.: Meu pedido já foi enviado?"
              />
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setMessage(suggestion)}
                    className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="as-test-sale">Número da venda (opcional)</FieldLabel>
              <Input id="as-test-sale" value={sale} onChange={(event) => setSale(event.target.value)} inputMode="numeric" placeholder="Ex.: 2000012345678901" />
              <FieldDescription>
                Com uma venda real da conta, o agente lê os itens, o pagamento, o envio, o rastreio e a previsão de entrega dela.
              </FieldDescription>
            </Field>
            <div>
              <Button onClick={run} disabled={pending || message.trim().length < 3}>
                {pending ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                Ver resposta do agente
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="min-h-80">
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
          <CardDescription>Exatamente o que o agente faria com a configuração atual.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {pending ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner /> O agente está lendo a venda e as informações da loja...
            </div>
          ) : !result ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Escreva uma mensagem e clique em &ldquo;Ver resposta do agente&rdquo;.
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
                  result.outcome === "send"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                )}
              >
                {result.outcome === "send" ? <CircleCheckIcon className="mt-0.5 size-4 shrink-0" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />}
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">
                    {result.outcome === "send" ? "O agente responderia sozinho" : "O agente deixaria esta conversa para você"} · certeza{" "}
                    {Math.round(result.confidence * 100)}%
                  </p>
                  <p className="opacity-90">
                    Assunto: {result.topic}. {result.reviewLabel ? `${result.reviewLabel}. ` : ""}
                    {result.reason}
                  </p>
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
                  <div className="flex flex-row-reverse items-start gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <BotIcon className="size-3.5" />
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <p className={cn("rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm", result.outcome === "send" ? "bg-primary/10" : "border border-dashed bg-card text-muted-foreground")}>
                        {result.text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.text.length}/350 caracteres{result.outcome === "review" ? " · rascunho que ficaria para você revisar" : ""}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              {result.saleText ? (
                <Collapsible className="rounded-xl border">
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
                    <PackageIcon className="size-4 text-muted-foreground" />
                    O que o agente leu da venda
                    <span className="ml-2 truncate text-xs font-normal text-muted-foreground">{result.saleLabel}</span>
                    <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="max-h-80 overflow-auto border-t bg-muted/30 px-3.5 py-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {result.saleText}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
