"use client"

import { BanIcon, GavelIcon, PercentIcon, SparklesIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { suggestReturnActionAction } from "@/app/(app)/recuperador/actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { SUGGESTION_BADGE } from "@/lib/recovery/presentation"
import type { ReviewMode } from "@/lib/recovery/returns"
import { CONFIDENCE_LABELS, suggestionLabel, type ReturnSuggestion, type SuggestedAction } from "@/lib/recovery/suggest"
import { cn } from "@/lib/utils"

const ICONS: Record<SuggestedAction, typeof GavelIcon> = {
  contest: GavelIcon,
  do_not_contest: BanIcon,
  partial_refund: PercentIcon,
}

const ACTION_ACCENT: Record<SuggestedAction, string> = {
  contest: "border-l-red-400/70 ring-red-500/15",
  do_not_contest: "border-l-primary/50 ring-primary/15",
  partial_refund: "border-l-amber-400/70 ring-amber-500/15",
}

/**
 * "Sugerir ação": recomendação da maanu (contestar / não contestar / ressarcimento parcial) ANTES do fluxo de revisão.
 * `initial` vem das regras (calculado no servidor, aparece na hora); a IA refina em seguida pela Server Action
 * `suggestReturnActionAction` e, se falhar ou estiver pausada, a tela continua com as regras. É só uma sugestão: não envia
 * nada ao Mercado Livre e não bloqueia nada. Contrato do card: ReturnSuggestion (lib/recovery/suggest.ts).
 */
export function ReturnSuggestionCard({
  returnRowId,
  mode,
  initial,
}: {
  returnRowId: string
  mode: ReviewMode
  initial: ReturnSuggestion
}) {
  const [suggestion, setSuggestion] = useState<ReturnSuggestion>(initial)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    suggestReturnActionAction(returnRowId)
      .then((result) => {
        if (!cancelled && result.ok) setSuggestion(result.suggestion)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [returnRowId])

  const Icon = ICONS[suggestion.action]
  return (
    <Card data-slot="return-suggestion" data-action={suggestion.action} data-source={suggestion.source} aria-busy={loading} className={cn("border-l-3 [--card-spacing:--spacing(5)]", ACTION_ACCENT[suggestion.action])}>
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          O que a maanu sugere
        </CardTitle>
        <CardDescription className="text-pretty leading-relaxed">Uma recomendação para ajudar você a decidir. Nada vai ao Mercado Livre sem a sua confirmação.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("h-auto min-h-8 max-w-full gap-2 border-transparent px-3 py-1.5 text-sm font-semibold whitespace-normal", SUGGESTION_BADGE[suggestion.action], suggestion.action === "contest" && "bg-red-500/10 text-red-700 dark:text-red-300")}>
            <Icon className="size-4 shrink-0" />
            {suggestionLabel(suggestion.action, mode)}
          </Badge>
          <Badge variant="outline" className="font-normal text-muted-foreground">{CONFIDENCE_LABELS[suggestion.confidence]}</Badge>
          {loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:ml-auto">
              <Spinner className="size-3 shrink-0" /> A IA está conferindo o caso...
            </span>
          ) : (
            <Badge variant="outline" className="border-transparent px-0 font-normal text-muted-foreground sm:ml-auto">
              {suggestion.source === "ai" ? "Sugestão da IA" : "Sugestão por regras"}
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-pretty">{suggestion.reason}</p>
        {suggestion.needsInspection ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Você é quem tem o produto em mãos: confira o pacote antes de decidir.</p>
        ) : null}
        {suggestion.signals.length ? (
          <ul className="flex flex-col gap-2 border-t border-foreground/10 pt-3 text-xs leading-relaxed text-muted-foreground">
            {suggestion.signals.map((signal) => (
              <li key={signal} className="flex items-start gap-2 before:mt-1.5 before:size-1 before:shrink-0 before:rounded-full before:bg-primary/60">{signal}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
