"use client"

import { FileIcon, PaperclipIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { generateSuggestion, sendReply } from "@/app/(app)/pos-venda/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const ACCEPT = ".jpg,.jpeg,.png,.pdf,.txt,image/jpeg,image/png,application/pdf,text/plain"
const MAX_FILES = 5
const MAX_BYTES = 4 * 1024 * 1024

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
}

export function ReplyComposer({
  conversationId,
  initialText,
  draftConfidence,
  maxLength,
  nextHref,
  canTeach,
}: {
  conversationId: string
  initialText: string
  draftConfidence: number | null
  maxLength: number
  nextHref: string | null
  /** Ensinar só faz sentido quando há mensagem do comprador esperando resposta. */
  canTeach: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(initialText)
  const [files, setFiles] = useState<File[]>([])
  const [teach, setTeach] = useState(canTeach)
  const [fromAi, setFromAi] = useState(Boolean(initialText))
  const [sending, startSending] = useTransition()
  const [suggesting, startSuggesting] = useTransition()
  const length = text.trim().length
  const busy = sending || suggesting
  const tooLong = length > maxLength
  const canSend = !busy && !tooLong && (length > 0 || files.length > 0)

  function suggest() {
    startSuggesting(async () => {
      const result = await generateSuggestion(conversationId)
      if (result.ok) {
        setText(result.composed)
        setFromAi(true)
        toast.success(`Sugestão pronta (${result.topic.toLowerCase()}, certeza ${Math.round(result.confidence * 100)}%). Revise antes de enviar.`)
      } else {
        toast.error(result.message)
      }
    })
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    const next = [...files, ...Array.from(list)].slice(0, MAX_FILES)
    if (next.reduce((total, file) => total + file.size, 0) > MAX_BYTES) {
      toast.error("Os anexos podem somar no máximo 4 MB por mensagem.")
      return
    }
    setFiles(next)
  }

  function send() {
    if (!canSend) return
    const form = new FormData()
    form.set("conversationId", conversationId)
    form.set("text", text)
    if (teach && canTeach && length) form.set("teach", "on")
    for (const file of files) form.append("files", file)
    startSending(async () => {
      try {
        const result = await sendReply(form)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        toast.success(result.message)
        setFiles([])
        if (nextHref) router.push(nextHref, { scroll: false })
        else {
          setText("")
          router.refresh()
        }
      } catch {
        toast.error("Não foi possível enviar. Se tiver anexos, confira se somam até 4 MB.")
      }
    })
  }

  return (
    <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {fromAi
            ? `Rascunho do agente${draftConfidence !== null ? ` · certeza ${Math.round(draftConfidence * 100)}%` : ""} — revise antes de enviar`
            : "Sua mensagem"}
        </span>
        <Button variant="ghost" size="sm" onClick={suggest} disabled={busy}>
          {suggesting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
          {fromAi ? "Gerar outra" : "Sugestão do agente"}
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            send()
          }
        }}
        maxLength={maxLength + 200}
        placeholder="Escreva para o comprador"
        aria-label="Mensagem para o comprador"
        title="Ctrl + Enter envia."
        className="max-h-44 min-h-20 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
      />
      {files.length ? (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-2 text-xs">
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-48 truncate">{file.name}</span>
              <span className="text-muted-foreground">{size(file.size)}</span>
              <button
                type="button"
                aria-label={`Remover ${file.name}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setFiles(files.filter((_, position) => position !== index))}
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-3 border-t px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || files.length >= MAX_FILES}
            onClick={() => fileInput.current?.click()}
            title="JPG, PNG, PDF ou TXT, até 4 MB no total"
          >
            <PaperclipIcon data-icon="inline-start" />
            Anexar
          </Button>
          {canTeach ? (
            <Field orientation="horizontal" className="w-auto" title="O agente passa a usar esta resposta em mensagens parecidas.">
              <Checkbox id={`teach-${conversationId}`} checked={teach} onCheckedChange={(checked) => setTeach(checked === true)} />
              <FieldLabel htmlFor={`teach-${conversationId}`} className="text-sm font-normal">
                Ensinar o agente
              </FieldLabel>
            </Field>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className={cn("text-xs tabular-nums text-muted-foreground", tooLong && "font-medium text-destructive")}>
            {length}/{maxLength}
          </span>
          <Button onClick={send} disabled={!canSend} title="Ctrl + Enter" aria-keyshortcuts="Control+Enter">
            {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            {nextHref ? "Enviar e ir para a próxima" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
