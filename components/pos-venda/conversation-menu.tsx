"use client"

import { ArchiveIcon, ArchiveRestoreIcon, BotIcon, ExternalLinkIcon, MoreHorizontalIcon, RefreshCwIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  archiveConversation,
  refreshFromMl,
  restoreConversation,
  retryWithAgent,
  type ActionResult,
} from "@/app/(app)/pos-venda/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

export function ConversationMenu({
  conversationId,
  saleUrl,
  permalink,
  canRetry,
  archived,
}: {
  conversationId: string
  saleUrl: string
  permalink: string | null
  canRetry: boolean
  archived: boolean
}) {
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<ActionResult>) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Mais ações" />} disabled={pending}>
        {pending ? <Spinner /> : <MoreHorizontalIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuItem onClick={() => run(() => refreshFromMl(conversationId))}>
          <RefreshCwIcon />
          Atualizar do Mercado Livre
        </DropdownMenuItem>
        {canRetry ? (
          <DropdownMenuItem onClick={() => run(() => retryWithAgent(conversationId))}>
            <BotIcon />
            Deixar o agente tentar de novo
          </DropdownMenuItem>
        ) : null}
        {archived ? (
          <DropdownMenuItem onClick={() => run(() => restoreConversation(conversationId))}>
            <ArchiveRestoreIcon />
            Desarquivar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => run(() => archiveConversation(conversationId))}>
            <ArchiveIcon />
            Arquivar conversa
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={saleUrl} target="_blank" rel="noreferrer" />}>
          <ExternalLinkIcon />
          Abrir a venda no Mercado Livre
        </DropdownMenuItem>
        {permalink ? (
          <DropdownMenuItem render={<a href={permalink} target="_blank" rel="noreferrer" />}>
            <ExternalLinkIcon />
            Abrir o anúncio
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
