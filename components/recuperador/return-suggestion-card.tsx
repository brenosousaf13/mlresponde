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
    <Card data-slot="return-suggestion" data-action={suggestion.action} data-source={suggestion.source} aria-busy={loading}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" />
          O que a maanu sugere
        </CardTitle>
        <CardDescription>Uma recomendação para ajudar você a decidir. Nada vai ao Mercado Livre sem a sua confirmação.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("h-7 gap-1.5 border-transparent px-2.5 text-sm", SUGGESTION_BADGE[suggestion.action])}>
            <Icon className="size-4" />
            {suggestionLabel(suggestion.action, mode)}
          </Badge>
          <Badge variant="outline">{CONFIDENCE_LABELS[suggestion.confidence]}</Badge>
          {loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner /> A IA está conferindo o caso...
            </span>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {suggestion.source === "ai" ? "Sugestão da IA" : "Sugestão por regras"}
            </Badge>
          )}
        </div>
        <p className="text-sm">{suggestion.reason}</p>
        {suggestion.needsInspection ? (
          <p className="text-xs text-muted-foreground">Você é quem tem o produto em mãos: confira o pacote antes de decidir.</p>
        ) : null}
        {suggestion.signals.length ? (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {suggestion.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}