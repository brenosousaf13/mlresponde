"use client"

import { PauseIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { pauseMlAccount } from "@/app/admin/actions"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

type Scope = "answers" | "after_sale" | "all"

const SCOPES: Record<Scope, { label: string; detail: string }> = {
  answers: { label: "Pausar respostas automáticas", detail: "as perguntas dos anúncios" },
  after_sale: { label: "Pausar o pós-venda", detail: "as mensagens de quem já comprou" },
  all: { label: "Pausar tudo", detail: "as perguntas e o pós-venda" },
}

/** Botão de emergência por conta: pausa a IA (religar continua sendo decisão do cliente). */
export function MlAccountPause({
  account,
}: {
  account: { id: string; nickname: string; autoReply: boolean; afterSale: boolean }
}) {
  const [scope, setScope] = useState<Scope | null>(null)
  const [pending, startTransition] = useTransition()
  if (!account.autoReply && !account.afterSale) return null

  const options = (Object.keys(SCOPES) as Scope[]).filter((key) =>
    key === "answers" ? account.autoReply : key === "after_sale" ? account.afterSale : account.autoReply && account.afterSale
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="xs" disabled={pending} />}>
          {pending ? <Spinner data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
          Pausar IA
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{account.nickname}</DropdownMenuLabel>
            {options.map((key) => (
              <DropdownMenuItem key={key} onClick={() => setScope(key)}>
                {SCOPES[key].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={scope !== null} onOpenChange={(next) => (next ? null : setScope(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{scope ? SCOPES[scope].label : ""} em {account.nickname}?</AlertDialogTitle>
            <AlertDialogDescription>
              A IA para de responder {scope ? SCOPES[scope].detail : ""} desta conta e tudo vai para o vendedor. Só o
              cliente consegue ligar de novo (no app). Avise o cliente do motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const chosen = scope
                setScope(null)
                if (!chosen) return
                startTransition(async () => {
                  const result = await pauseMlAccount(account.id, chosen)
                  if (result.ok) toast.success(result.message)
                  else toast.error(result.message)
                })
              }}
            >
              Pausar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
