"use client"

import { CheckIcon, CopyIcon, ExternalLinkIcon, FlagIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { markExclusionAction } from "@/app/(app)/reputacao/reclamacoes/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EXCLUSION_HOW_TO, EXCLUSION_RULES_URL } from "@/lib/reputation/exclusions"
import { cn } from "@/lib/utils"

/** Texto pronto para pedir a exclusão no ML + "Pedi a exclusão" (a maanu passa a acompanhar). */
export function ClaimExclusionActions({
  claimRowId,
  text,
  requestedAt,
}: {
  claimRowId: string
  text: string
  requestedAt: string | null
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      {text ? <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{text}</div> : null}
      <p className="text-xs text-muted-foreground">{EXCLUSION_HOW_TO}</p>
      <div className="flex flex-wrap gap-2">
        {text ? (
          <Button
            variant="outline"
            size="sm"
            className="bg-card"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                toast.success("Texto copiado.")
              } catch {
                toast.error("Não foi possível copiar. Selecione o texto e copie.")
              }
            }}
          >
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            Copiar texto
          </Button>
        ) : null}
        <a
          href={EXCLUSION_RULES_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card")}
        >
          Regras do ML
          <ExternalLinkIcon data-icon="inline-end" />
        </a>
        {requestedAt ? null : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markExclusionAction(claimRowId).catch(() => ({ ok: false, message: "Não foi possível salvar." }))
                if (result.ok) {
                  toast.success(result.message)
                  router.refresh()
                } else toast.error(result.message)
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : <FlagIcon data-icon="inline-start" />}
            Pedi a exclusão
          </Button>
        )}
      </div>
    </div>
  )
}
