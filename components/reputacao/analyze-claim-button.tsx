"use client"

import { SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { analyzeClaimAction } from "@/app/(app)/reputacao/reclamacoes/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Gera (ou refaz) a análise da IA agora. */
export function AnalyzeClaimButton({ claimRowId, label, disabled }: { claimRowId: string; label: string; disabled?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-card"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await analyzeClaimAction(claimRowId).catch(() => ({ ok: false, message: "Não foi possível analisar agora." }))
          if (result.ok) {
            toast.success(result.message)
            router.refresh()
          } else toast.error(result.message)
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
      {pending ? "Analisando..." : label}
    </Button>
  )
}
