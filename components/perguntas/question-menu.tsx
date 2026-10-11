"use client"

import { ArchiveIcon, ArchiveRestoreIcon, BotIcon, ExternalLinkIcon, MoreHorizontalIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  ignoreQuestion,
  restoreQuestion,
  retryWithAi,
  type QuestionActionResult,
} from "@/app/(app)/perguntas/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

export function QuestionMenu({
  questionId,
  permalink,
  open,
  archived,
}: {
  questionId: string
  permalink: string | null
  open: boolean
  archived: boolean
}) {
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<QuestionActionResult>) {
    startTransition(async () => {
      try {
        const result = await action()
        if (result.ok) toast.success(result.message)
        else toast.error(result.message)
      } catch {
        toast.error("Algo deu errado. Tente novamente.")
      }
    })
  }

  if (!open && !archived && !permalink) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Mais ações" />} disabled={pending}>
        {pending ? <Spinner /> : <MoreHorizontalIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {open ? (
          <>
            <DropdownMenuItem onClick={() => run(() => retryWithAi(questionId))}>
              <BotIcon />
              Deixar a IA tentar de novo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run(() => ignoreQuestion(questionId))}>
              <ArchiveIcon />
              Arquivar sem responder
            </DropdownMenuItem>
          </>
        ) : null}
        {archived ? (
          <DropdownMenuItem onClick={() => run(() => restoreQuestion(questionId))}>
            <ArchiveRestoreIcon />
            Voltar para &ldquo;Para responder&rdquo;
          </DropdownMenuItem>
        ) : null}
        {permalink ? (
          <>
            {open || archived ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem render={<a href={permalink} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon />
              Abrir anúncio no Mercado Livre
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
