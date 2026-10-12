"use client"

import { OctagonPauseIcon, PlayIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setPlatformAiPaused } from "@/app/admin/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** Botão de emergência: pausa (ou retoma) toda chamada à OpenAI da plataforma. */
export function PlatformAiSwitch({
  paused,
  reason,
  pausedAt,
  pausedBy,
}: {
  paused: boolean
  reason: string
  pausedAt: string | null
  pausedBy: string | null
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()

  function confirm() {
    setOpen(false)
    startTransition(async () => {
      const result = await setPlatformAiPaused(!paused, text)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
      setText("")
    })
  }

  return (
    <Card className={cn(paused && "border-destructive/40 bg-destructive/5 ring-destructive/30")}>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2", paused && "text-destructive")}>
          {paused ? <OctagonPauseIcon className="size-5" /> : <span className="size-2.5 rounded-full bg-primary" />}
          {paused ? "IA de toda a plataforma PAUSADA" : "IA funcionando em toda a plataforma"}
        </CardTitle>
        <CardDescription>
          {paused ? (
            <>
              Nenhuma chamada à OpenAI está saindo: perguntas e conversas novas vão para os vendedores, sugestões e testes
              ficam indisponíveis e o app mostra um aviso aos clientes.
              {pausedAt ? ` Pausada em ${new Date(pausedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
              {pausedBy ? ` por ${pausedBy}` : ""}.{reason ? ` Motivo: ${reason}` : ""}
            </>
          ) : (
            "Use a pausa geral só em emergência: IA respondendo errado, OpenAI fora do ar ou custo disparando. Para um cliente só, pause a IA na ficha dele."
          )}
        </CardDescription>
        <CardAction>
          <Button variant={paused ? "default" : "destructive"} onClick={() => setOpen(true)} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : paused ? <PlayIcon data-icon="inline-start" /> : <OctagonPauseIcon data-icon="inline-start" />}
            {paused ? "Retomar a IA" : "Pausar toda a IA"}
          </Button>
        </CardAction>
      </CardHeader>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paused ? "Retomar a IA em toda a plataforma?" : "Pausar a IA de TODOS os clientes?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {paused
                ? "As próximas perguntas e mensagens voltam a ser respondidas automaticamente. O que ficou com os vendedores durante a pausa continua com eles."
                : "Nenhuma resposta automática sai enquanto estiver pausada. Os vendedores recebem as perguntas para responder e veem um aviso no app."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {paused ? null : (
            <Field>
              <FieldLabel htmlFor="pause-reason">Motivo (fica no histórico)</FieldLabel>
              <Textarea
                id="pause-reason"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ex.: OpenAI instável, respostas erradas sobre frete..."
              />
              <FieldDescription>Só a equipe vê o motivo; os clientes veem um aviso genérico.</FieldDescription>
            </Field>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant={paused ? "default" : "destructive"} onClick={confirm}>
              {paused ? "Retomar" : "Pausar toda a IA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
