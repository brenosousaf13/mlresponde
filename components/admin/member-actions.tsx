"use client"

import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  MailCheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  confirmUserEmail,
  createPasswordRecoveryLink,
  setUserBlocked,
  updateMember,
} from "@/app/admin/actions"
import { fieldErrors, FormMessage, SubmitButton } from "@/components/forms/form-feedback"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatWhatsapp, type FormState } from "@/lib/validation/forms"

export type MemberSummary = {
  userId: string
  email: string
  fullName: string
  whatsapp: string | null
  emailConfirmed: boolean
  banned: boolean
  isPlatformAdmin: boolean
}

type Open = null | "edit" | "block" | "link"

/** Ações de suporte sobre um usuário: editar, confirmar e-mail, link de senha nova e bloqueio. */
export function MemberActions({ member, isSelf }: { member: MemberSummary; isSelf: boolean }) {
  const [open, setOpen] = useState<Open>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const locked = member.isPlatformAdmin

  const [state, action, saving] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await updateMember(member.userId, previous, formData)
    if (result.ok) {
      toast.success(result.message ?? "Salvo.")
      setOpen(null)
    }
    return result
  }, {})
  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]?.length) || undefined

  function run(task: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await task()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações para ${member.email}`} disabled={pending} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setOpen("edit")}>
              <PencilIcon />
              Editar nome, WhatsApp e e-mail
            </DropdownMenuItem>
            {member.emailConfirmed ? null : (
              <DropdownMenuItem onClick={() => run(() => confirmUserEmail(member.userId))}>
                <MailCheckIcon />
                Confirmar e-mail manualmente
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={locked}
              onClick={() =>
                startTransition(async () => {
                  const result = await createPasswordRecoveryLink(member.userId)
                  if (!result.ok) {
                    toast.error(result.message)
                    return
                  }
                  setLink(result.link)
                  setCopied(false)
                  setOpen("link")
                })
              }
            >
              <KeyRoundIcon />
              Gerar link de senha nova
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={member.banned ? "default" : "destructive"}
            disabled={locked || isSelf}
            onClick={() => (member.banned ? run(() => setUserBlocked(member.userId, false)) : setOpen("block"))}
          >
            {member.banned ? <ShieldCheckIcon /> : <BanIcon />}
            {member.banned ? "Desbloquear acesso" : "Bloquear acesso"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={(next) => setOpen(next ? "edit" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Trocar o e-mail muda o login na hora (o novo e-mail já entra confirmado). Tudo fica no histórico.
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-6">
            <FieldGroup>
              <Field data-invalid={invalid("full_name")}>
                <FieldLabel htmlFor={`name-${member.userId}`}>Nome</FieldLabel>
                <Input id={`name-${member.userId}`} name="full_name" defaultValue={member.fullName} maxLength={120} />
                <FieldError errors={fieldErrors(state, "full_name")} />
              </Field>
              <Field data-invalid={invalid("whatsapp")}>
                <FieldLabel htmlFor={`whatsapp-${member.userId}`}>WhatsApp</FieldLabel>
                <Input
                  id={`whatsapp-${member.userId}`}
                  name="whatsapp"
                  inputMode="tel"
                  defaultValue={formatWhatsapp(member.whatsapp)}
                  placeholder="(11) 98765-4321"
                />
                <FieldError errors={fieldErrors(state, "whatsapp")} />
              </Field>
              <Field data-invalid={invalid("email")}>
                <FieldLabel htmlFor={`email-${member.userId}`}>E-mail de acesso</FieldLabel>
                <Input
                  id={`email-${member.userId}`}
                  name="email"
                  type="email"
                  defaultValue={member.email}
                  readOnly={locked}
                  required
                />
                {locked ? <FieldDescription>Administradores só mudam de e-mail pelo banco.</FieldDescription> : null}
                <FieldError errors={fieldErrors(state, "email")} />
              </Field>
            </FieldGroup>
            <FormMessage state={state.ok ? {} : state} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <SubmitButton pending={saving} pendingLabel="Salvando...">
                Salvar
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "block"} onOpenChange={(next) => setOpen(next ? "block" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear o acesso de {member.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa não consegue mais entrar e a sessão aberta para de renovar (até 1 hora). A IA da loja continua
              funcionando: para parar as respostas, pause a IA nas contas do Mercado Livre. Dá para desbloquear depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpen(null)
                run(() => setUserBlocked(member.userId, true))
              }}
            >
              Bloquear acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open === "link"} onOpenChange={(next) => setOpen(next ? "link" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link para criar uma senha nova</DialogTitle>
            <DialogDescription>
              Mande só para {member.email} (ex.: pelo WhatsApp). Vale por 1 hora e funciona uma vez. Quem abrir o link
              entra na conta: não abra no seu navegador.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{link}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copiar link"
              onClick={async () => {
                if (!link) return
                await navigator.clipboard.writeText(link)
                setCopied(true)
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>Pronto</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
