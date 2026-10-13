"use client"

import {
  ArchiveRestoreIcon,
  BanIcon,
  CirclePlayIcon,
  EllipsisIcon,
  FlaskConicalIcon,
  Trash2Icon,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteAiKey, setAiKeyStatus, testAiKey, type AiKeyActionResult } from "@/app/admin/(painel)/chaves-ia/actions"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

type KeyInfo = { id: string; label: string; hint: string; status: "active" | "standby" | "disabled" }
type Confirm = "disable" | "delete" | null

/** Ações de uma chave: testar, pôr em uso, reserva, desativar e remover (as duas últimas pedem confirmação). */
export function AiKeyActions({
  keyInfo,
  nextStandby,
  envConfigured,
}: {
  keyInfo: KeyInfo
  /** Reserva que entra no lugar se a chave em uso for desativada. */
  nextStandby: string | null
  envConfigured: boolean
}) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [pending, startTransition] = useTransition()

  function run(task: () => Promise<AiKeyActionResult>) {
    startTransition(async () => {
      const result = await task()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    })
  }

  const disableDetail =
    keyInfo.status !== "active"
      ? "Ela deixa de ser reserva e não é mais usada."
      : nextStandby
        ? `A reserva "${nextStandby}" entra em uso no lugar dela na hora.`
        : envConfigured
          ? "Não há reserva: a IA passa a usar a variável OPENAI_API_KEY da Vercel."
          : "Não há reserva nem a variável OPENAI_API_KEY: a IA PARA de responder até outra chave entrar em uso."

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações da chave ${keyInfo.label}`} disabled={pending} />}
        >
          {pending ? <Spinner /> : <EllipsisIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {keyInfo.label} · <span className="font-mono">{keyInfo.hint}</span>
            </DropdownMenuLabel>
            {keyInfo.status !== "active" ? (
              <DropdownMenuItem onClick={() => run(() => setAiKeyStatus(keyInfo.id, "active"))}>
                <CirclePlayIcon />
                Testar e usar esta chave
              </DropdownMenuItem>
            ) : null}
            {keyInfo.status === "disabled" ? (
              <DropdownMenuItem onClick={() => run(() => setAiKeyStatus(keyInfo.id, "standby"))}>
                <ArchiveRestoreIcon />
                Testar e deixar como reserva
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => run(() => testAiKey(keyInfo.id))}>
              <FlaskConicalIcon />
              Testar agora
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {keyInfo.status === "disabled" ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2Icon />
              Remover
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("disable")}>
              <BanIcon />
              Desativar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(next) => (next ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? `Remover a chave "${keyInfo.label}"?` : `Desativar a chave "${keyInfo.label}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "A chave sai da maanu de vez (o histórico guarda só o nome e o final dela). Isso não revoga a chave na OpenAI: revogue lá também, se ela não for mais usada."
                : `${disableDetail} Dá para reativar depois (a chave é testada de novo).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const chosen = confirm
                setConfirm(null)
                if (chosen === "delete") run(() => deleteAiKey(keyInfo.id))
                else if (chosen === "disable") run(() => setAiKeyStatus(keyInfo.id, "disabled"))
              }}
            >
              {confirm === "delete" ? "Remover" : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
