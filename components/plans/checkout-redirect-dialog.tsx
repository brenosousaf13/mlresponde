"use client"

import { LockKeyholeIcon, ShieldCheckIcon, Undo2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { LogoMark } from "@/components/brand/logo"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

/** Se a página de pagamento não abrir sozinha depois deste tempo, mostra o link. */
const FALLBACK_LINK_MS = 8000

const REASSURANCES = [
  { icon: ShieldCheckIcon, text: "Pagamento em ambiente seguro e criptografado." },
  { icon: LockKeyholeIcon, text: "Os dados do cartão ficam com a AbacatePay: a maanu não vê nem guarda esses dados." },
  { icon: Undo2Icon, text: "Ao concluir, você volta para a maanu e o plano é liberado na hora." },
] as const

/**
 * Tela de espera antes de ir para a página de pagamento da AbacatePay: explica o redirecionamento (para o cliente
 * não estranhar sair da maanu) e fica aberta até o navegador trocar de página.
 */
export function CheckoutRedirectDialog({
  open,
  summary,
  url,
}: {
  open: boolean
  /** "Plano Pro · R$ 197 por mês". */
  summary: string
  /** Endereço da página de pagamento (null enquanto ela está sendo criada). */
  url: string | null
}) {
  return (
    // Não fecha com Esc nem clicando fora: some sozinha quando a página de pagamento abre (ou se der erro).
    <Dialog open={open} disablePointerDismissal onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="relative mb-1 flex size-14 items-center justify-center rounded-full bg-primary/10" aria-hidden>
            <Spinner className="absolute inset-0 size-14 text-primary/40 [animation-duration:1.4s]" />
            <LogoMark className="h-5 text-foreground" label="" />
          </div>
          <DialogTitle className="text-lg">Levando você para o pagamento seguro</DialogTitle>
          <DialogDescription className="text-balance">
            Você será redirecionado para a página de pagamento da <strong className="text-foreground">AbacatePay</strong>, a
            empresa que processa os pagamentos da maanu.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-center text-sm font-medium">{summary}</div>

        <ul className="flex flex-col gap-2.5">
          {REASSURANCES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <RedirectStatus key={url ?? "preparing"} url={url} />
      </DialogContent>
    </Dialog>
  )
}

function RedirectStatus({ url }: { url: string | null }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!url) return
    const timer = setTimeout(() => setSlow(true), FALLBACK_LINK_MS)
    return () => clearTimeout(timer)
  }, [url])

  return (
    <div className="-mx-4 -mb-4 flex flex-col items-center gap-1 rounded-b-xl border-t bg-muted/50 p-4 text-center text-sm">
      <p className="flex items-center gap-2 font-medium" role="status" aria-live="polite">
        <Spinner />
        {url ? "Abrindo a página de pagamento…" : "Preparando sua página de pagamento…"}
      </p>
      {slow && url ? (
        <p className="text-xs text-muted-foreground">
          A página não abriu?{" "}
          <a href={url} className="font-medium text-primary underline underline-offset-3">
            Clique aqui para continuar
          </a>
        </p>
      ) : null}
    </div>
  )
}