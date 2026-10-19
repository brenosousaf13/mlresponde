"use client"

import { PaperclipIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { sendClaimMessageAction } from "@/app/(app)/reputacao/reclamacoes/actions"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatNumber } from "@/lib/format"
import { CLAIM_MESSAGE_MAX, validateAttachments } from "@/lib/reputation/claim-details"
import { cn } from "@/lib/utils"

type Receiver = "message_buyer" | "message_mediator"

const RECEIVER_LABELS: Record<Receiver, { short: string; to: string; button: string }> = {
  message_buyer: { short: "Comprador", to: "ao comprador", button: "Enviar ao comprador" },
  message_mediator: { short: "Mediador do ML", to: "ao mediador do Mercado Livre", button: "Enviar ao mediador" },
}

/** Responder ao comprador ou ao mediador pela reclamação (com anexos), com os rascunhos da IA à mão. */
export function ClaimComposer({
  claimRowId,
  receivers,
  drafts,
}: {
  claimRowId: string
  receivers: Receiver[]
  drafts: { buyer: string; mediator: string }
}) {
  const router = useRouter()
  const [receiver, setReceiver] = useState<Receiver>(receivers[0])
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)
  const draft = receiver === "message_buyer" ? drafts.buyer : drafts.mediator
  const tooLong = message.length > CLAIM_MESSAGE_MAX
  const filesError = validateAttachments(files)

  function send() {
    const form = new FormData()
    form.set("claimRowId", claimRowId)
    form.set("receiver", receiver)
    form.set("message", message)
    for (const file of files) form.append("files", file)
    startTransition(async () => {
      try {
        const result = await sendClaimMessageAction(form)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        toast.success(result.message)
        setMessage("")
        setFiles([])
        setConfirmOpen(false)
        router.refresh()
      } catch {
        toast.error("Não foi possível enviar agora.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {receivers.length > 1 ? (
        <ToggleGroup
          value={[receiver]}
          onValueChange={(value) => value[0] && setReceiver(value[0] as Receiver)}
          variant="outline"
          size="sm"
          aria-label="Para quem enviar"
        >
          {receivers.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {RECEIVER_LABELS[item].short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <p className="text-sm text-muted-foreground">Para: {RECEIVER_LABELS[receiver].short}</p>
      )}

      {draft ? (
        <button
          type="button"
          onClick={() => setMessage(draft)}
          className="flex items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] p-3 text-left text-sm hover:bg-primary/[0.08]"
        >
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-brand-teal-ink" />
          <span>
            <span className="font-medium text-brand-teal-ink">Usar o rascunho da IA</span>
            <span className="mt-0.5 line-clamp-3 text-muted-foreground">{draft}</span>
          </span>
        </button>
      ) : null}

      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={6}
        placeholder="Escreva a mensagem. Ela vai pelo Mercado Livre, na própria reclamação."
        aria-label="Mensagem"
        aria-invalid={tooLong || undefined}
        className="bg-card"
      />

      {files.length ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li key={file.name + index} className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
              <PaperclipIcon className="size-3" />
              <span className="max-w-48 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={"Tirar " + file.name}
                onClick={() => setFiles(files.filter((_, position) => position !== index))}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {filesError ? <p className="text-xs text-destructive">{filesError}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              setFiles([...files, ...Array.from(event.target.files ?? [])])
              event.target.value = ""
            }}
          />
          <Button type="button" variant="outline" size="sm" className="bg-card" onClick={() => fileInput.current?.click()}>
            <PaperclipIcon data-icon="inline-start" />
            Anexar
          </Button>
          <span className={cn("text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
            {formatNumber(message.length)}/{formatNumber(CLAIM_MESSAGE_MAX)}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!message.trim() || tooLong || Boolean(filesError) || pending}
          onClick={() => setConfirmOpen(true)}
        >
          <SendIcon data-icon="inline-start" />
          {RECEIVER_LABELS[receiver].button}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG ou PDF, até 4 MB no total. Nada de telefone, e-mail ou links.</p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar {RECEIVER_LABELS[receiver].to}?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem
              {files.length ? " e " + files.length + (files.length === 1 ? " anexo vão" : " anexos vão") : " vai"} pelo Mercado
              Livre, na reclamação. Depois de enviada não dá para apagar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{message.trim()}</div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              Enviar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
