"use client"

import {
  MoreHorizontalIcon,
  PlugZapIcon,
  PowerIcon,
  PowerOffIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  checkMlAccount,
  disconnectMlAccount,
  setMlAccountStatus,
  type ActionResult,
} from "@/app/(app)/contas/actions"
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

export function MlAccountActions({
  accountId,
  nickname,
  status,
  tokenStatus,
}: {
  accountId: string
  nickname: string
  status: string
  tokenStatus: string
}) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

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

  const needsReconnect = status === "disconnected" || tokenStatus === "invalid"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Ações da conta ${nickname}`} />}
          disabled={pending}
        >
          {pending ? <Spinner /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {needsReconnect ? (
            <DropdownMenuItem render={<a href="/api/ml/oauth/start" />}>
              <PlugZapIcon />
              Reconectar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => run(() => checkMlAccount(accountId))}>
              <RefreshCwIcon />
              Verificar conexão
            </DropdownMenuItem>
          )}
          {status === "active" ? (
            <DropdownMenuItem onClick={() => run(() => setMlAccountStatus(accountId, "inactive"))}>
              <PowerOffIcon />
              Desativar
            </DropdownMenuItem>
          ) : null}
          {status === "inactive" ? (
            <DropdownMenuItem onClick={() => run(() => setMlAccountStatus(accountId, "active"))}>
              <PowerIcon />
              Ativar
            </DropdownMenuItem>
          ) : null}
          {status !== "disconnected" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                <UnplugIcon />
                Desconectar
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {nickname}?</AlertDialogTitle>
            <AlertDialogDescription>
              A plataforma para de acessar essa conta e de responder as perguntas dela. O histórico continua
              guardado e você pode reconectar quando quiser. Para revogar o acesso por completo, remova também o
              aplicativo nas configurações de segurança do Mercado Livre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false)
                run(() => disconnectMlAccount(accountId))
              }}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
