"use client"

import { SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { analyzeListing } from "@/app/(app)/melhorias/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/** Gera as sugestões de melhoria de um anúncio e abre o resultado. */
export function AnalyzeButton({
  accountId,
  itemId,
  label = "Analisar",
  variant = "default",
  disabledReason,
  className,
}: {
  className?: string
  accountId: string
  itemId: string
  label?: string
  variant?: "default" | "outline" | "ghost"
  /** Preenchido = botão desativado, com o motivo ao passar o mouse. */
  disabledReason?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const button = (
    <Button
      size="sm"
      variant={variant}
      disabled={pending || Boolean(disabledReason)}
      onClick={() =>
        startTransition(async () => {
          const result = await analyzeListing(accountId, itemId)
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          toast.success("Análise pronta! Veja as sugestões para o anúncio.")
          router.push(`/melhorias/${result.id}`)
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
      {pending ? "Analisando…" : label}
    </Button>
  )

  if (disabledReason) {
    return (
      <span title={disabledReason} className={cn("inline-flex", className)}>
        {button}
      </span>
    )
  }
  return (
    <span className={cn("inline-flex flex-col items-end gap-1", className)}>
      {button}
      {pending ? <span className="text-[11px] text-muted-foreground">pode levar até 1 minuto</span> : null}
    </span>
  )
}
