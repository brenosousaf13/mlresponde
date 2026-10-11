"use client"

import { CheckIcon, ExternalLinkIcon, InfoIcon, PlusIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const PERMISSIONS = [
  "Ler e responder as perguntas dos seus anúncios",
  "Consultar as informações dos seus anúncios",
  "Nada é publicado ou alterado nos anúncios sem você pedir",
]

export function ConnectMlDialog({
  label = "Conectar conta",
  variant = "default",
}: {
  label?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant={variant} />}>
        <PlusIcon data-icon="inline-start" />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar conta do Mercado Livre</DialogTitle>
          <DialogDescription>
            Você será levado ao Mercado Livre para autorizar o acesso à sua conta de vendedor.
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <InfoIcon />
          <AlertDescription>
            O Mercado Livre autoriza a conta que estiver logada no seu navegador. Se você tem mais de uma,
            entre primeiro com a conta que quer conectar.
          </AlertDescription>
        </Alert>
        <ul className="flex flex-col gap-2 text-sm">
          {PERMISSIONS.map((permission) => (
            <li key={permission} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {permission}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <a href="/api/ml/oauth/start" className={cn(buttonVariants())}>
            <ExternalLinkIcon data-icon="inline-start" />
            Ir para o Mercado Livre
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
