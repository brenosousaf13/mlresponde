import { ArrowLeftIcon, ExternalLinkIcon, LightbulbIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AnalyzeButton } from "@/components/melhorias/analyze-button"
import { SuggestionCard } from "@/components/melhorias/suggestion-card"
import { ItemThumb } from "@/components/perguntas/question-detail"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireSection } from "@/lib/dal/app-context"
import { getImprovement } from "@/lib/dal/listing-improvements"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import { EFFECT_BEFORE_DAYS, improvementEffect } from "@/lib/listing-improvements/presentation"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Melhorias de anúncio" }
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatRate(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
}

export default async function ListingImprovementPage({ params }: PageProps<"/melhorias/[id]">) {
  const context = await requireSection("melhorias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const improvement = await getImprovement(context.organization.id, id)
  if (!improvement) notFound()

  const { result, done } = improvement
  const effect = improvementEffect(improvement.effect)
  const questionsHref = `/perguntas?${new URLSearchParams({ aba: "todas", anuncio: improvement.itemId }).toString()}`

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/melhorias"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Voltar para Melhorias de anúncio"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <ItemThumb src={improvement.thumbnail} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold leading-snug tracking-tight">{improvement.title ?? improvement.itemId}</h2>
            <p className="text-sm text-muted-foreground">
              {[improvement.accountNickname, improvement.itemId, `analisado em ${formatDateTime(improvement.createdAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {improvement.permalink ? (
                <a
                  href={improvement.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir no Mercado Livre <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : null}
              <Link href={questionsHref} className="text-muted-foreground hover:text-primary hover:underline">
                Ver as perguntas deste anúncio
              </Link>
            </div>
          </div>
        </div>
        <AnalyzeButton
          accountId={improvement.accountId}
          itemId={improvement.itemId}
          label="Analisar de novo"
          variant="outline"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LightbulbIcon className="size-4 text-primary" />
              Resumo
            </CardTitle>
            <CardDescription>
              {pluralize(improvement.questionsAnalyzed, "pergunta analisada", "perguntas analisadas")}
              {improvement.questionsFrom && improvement.questionsTo
                ? `, de ${formatDate(improvement.questionsFrom, "short")} a ${formatDate(improvement.questionsTo, "short")}`
                : ""}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{result.summary || "A IA não encontrou um padrão claro nas perguntas deste anúncio."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Depois das mudanças</CardTitle>
            <CardDescription>Perguntas por semana neste anúncio, antes e depois da análise.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/60 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">Antes ({EFFECT_BEFORE_DAYS} dias)</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatRate(effect.beforePerWeek)}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">Depois</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{effect.ready ? formatRate(effect.afterPerWeek) : "—"}</dd>
              </div>
            </dl>
            {effect.ready ? (
              effect.changePercent === null ? null : (
                <p
                  className={cn(
                    "flex items-center gap-1.5 font-medium",
                    effect.changePercent <= 0 ? "text-primary" : "text-amber-700 dark:text-amber-400"
                  )}
                >
                  {effect.changePercent <= 0 ? <TrendingDownIcon className="size-4" /> : <TrendingUpIcon className="size-4" />}
                  {effect.changePercent <= 0
                    ? `${Math.abs(effect.changePercent)}% menos perguntas por semana`
                    : `${effect.changePercent}% mais perguntas por semana`}
                </p>
              )
            ) : (
              <p className="text-muted-foreground">
                Aplique as sugestões no anúncio e volte em {pluralize(effect.daysLeft, "dia", "dias")} para ver a diferença.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {result.suggestions.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LightbulbIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhuma mudança sugerida</EmptyTitle>
              <EmptyDescription>
                As perguntas deste anúncio não se repetem o suficiente para indicar algo faltando. Analise de novo quando ele
                receber mais perguntas.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-tight">O que mudar no anúncio</h3>
            <span className="text-sm text-muted-foreground">
              {done.length} de {result.suggestions.length} {result.suggestions.length === 1 ? "feita" : "feitas"}
            </span>
          </div>
          {result.suggestions.map((suggestion, index) => (
            <SuggestionCard
              key={`${improvement.id}-${index}`}
              improvementId={improvement.id}
              index={index}
              suggestion={suggestion}
              done={done.includes(index)}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            As mudanças são feitas por você, no Mercado Livre (Anúncios › Modificar). A maanu não altera o anúncio sozinha.
          </p>
        </div>
      )}

      <div>
        <Link href="/melhorias" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card")}>
          <ArrowLeftIcon data-icon="inline-start" />
          Voltar para os anúncios
        </Link>
      </div>
    </>
  )
}
