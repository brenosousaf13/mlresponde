import { ArrowRightIcon, ExternalLinkIcon, HistoryIcon, LightbulbIcon, PackageSearchIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { AnalyzeButton } from "@/components/melhorias/analyze-button"
import { ItemThumb } from "@/components/perguntas/question-detail"
import { UsageMeter } from "@/components/plans/usage-meter"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireSection } from "@/lib/dal/app-context"
import { getImprovementsOverview } from "@/lib/dal/listing-improvements"
import { getPlanUsage } from "@/lib/dal/plan"
import { formatDate, formatNumber, timeAgo } from "@/lib/format"
import { IMPROVEMENT_PERIOD_DAYS } from "@/lib/listing-improvements/presentation"
import { MIN_ANALYZED_QUESTIONS } from "@/lib/listing-improvements/prompt"
import { nextPlan } from "@/lib/plans/plans"
import { periodText } from "@/lib/plans/usage"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Melhorias de anúncio" }
// A análise (Server Action desta página) lê o anúncio no Mercado Livre e chama a IA: pode levar até ~1 minuto.
export const maxDuration = 120

const STEPS = [
  "Escolhemos os anúncios que mais recebem perguntas.",
  "A IA lê o anúncio e as perguntas (com as suas respostas) e encontra o que se repete.",
  "Você recebe o que mudar no título, na descrição, na ficha técnica ou nas fotos, com o texto pronto para colar.",
]

export default async function ListingImprovementsPage({ searchParams }: PageProps<"/melhorias">) {
  const context = await requireSection("melhorias")
  const params = await searchParams
  const organizationId = context.organization.id

  const supabase = await createClient()
  const { data: accountRows, error: accountsError } = await supabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id, status, token_status")
    .eq("organization_id", organizationId)
    .order("created_at")
  if (accountsError) throw accountsError
  const accounts = accountRows.map((account) => ({
    id: account.id,
    nickname: account.nickname || `Conta ${account.ml_user_id}`,
    usable: account.status !== "disconnected" && account.token_status !== "invalid",
  }))
  const accountId =
    typeof params.conta === "string" && accounts.some((account) => account.id === params.conta) ? params.conta : null
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const [{ candidates, history }, usage] = await Promise.all([
    getImprovementsOverview(organizationId, accountId),
    getPlanUsage(context),
  ])
  const quota = usage.improvements
  const quotaReached = quota?.level === "reached"
  const upgrade = nextPlan(context.plan)

  return (
    <>
      <PageHeader
        title="Melhorias de anúncio"
        description="A IA lê as perguntas que cada anúncio recebe e diz o que mudar nele para os compradores não precisarem perguntar."
        actions={accounts.length > 1 ? <AccountSelect accounts={accounts} value={accountId} allowAll resetParams={[]} /> : null}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LightbulbIcon className="size-4 text-primary" />
              Menos perguntas repetidas, mais vendas
            </CardTitle>
            <CardDescription>
              Quando a resposta está no anúncio, o comprador decide na hora, sem esperar. E a sua cota de respostas rende mais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sua cota</CardTitle>
            <CardDescription>
              Cada análise de anúncio usa 1 da cota {context.plan.id === "trial" ? "do teste grátis" : `do plano ${context.plan.name}`}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quota ? <UsageMeter label="Análises usadas" quota={quota} hint={periodText(usage.period)} /> : null}
          </CardContent>
          {quotaReached && upgrade ? (
            <CardFooter className="text-sm">
              <Link href="/assinatura" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Precisa de mais? Conheça o plano {upgrade.name}
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anúncios com mais perguntas</CardTitle>
          <CardDescription>
            Últimos {IMPROVEMENT_PERIOD_DAYS} dias. Comece pelos de cima: são os que mais geram dúvidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {candidates.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageSearchIcon />
                </EmptyMedia>
                <EmptyTitle>Ainda não há perguntas suficientes</EmptyTitle>
                <EmptyDescription>
                  Os anúncios aparecem aqui conforme recebem perguntas. A análise precisa de pelo menos {MIN_ANALYZED_QUESTIONS}{" "}
                  perguntas no anúncio.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Anúncio</TableHead>
                  <TableHead className="w-16 text-right sm:w-24">Perguntas</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">Última análise</TableHead>
                  <TableHead className="w-24 pr-4 text-right sm:w-44">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((item, index) => {
                  const account = accountById.get(item.accountId)
                  const disabledReason =
                    item.questions < MIN_ANALYZED_QUESTIONS
                      ? `Precisa de pelo menos ${MIN_ANALYZED_QUESTIONS} perguntas para analisar.`
                      : account && !account.usable
                        ? "Reconecte esta conta do Mercado Livre para analisar."
                        : quotaReached
                          ? "Você já usou todas as análises do período."
                          : null
                  return (
                    <TableRow key={`${item.accountId}:${item.itemId}`}>
                      <TableCell className="pl-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="hidden w-4 shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">{index + 1}</span>
                          <span className="hidden sm:block">
                            <ItemThumb src={item.thumbnail} size="sm" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={item.title ?? item.itemId}>
                              {item.title ?? item.itemId}
                            </p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              {[accounts.length > 1 ? account?.nickname : null, item.itemId].filter(Boolean).join(" · ")}
                              {item.permalink ? (
                                <a
                                  href={item.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center hover:text-foreground"
                                  aria-label="Abrir anúncio no Mercado Livre"
                                >
                                  <ExternalLinkIcon className="size-3" />
                                </a>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium">{formatNumber(item.questions)}</span>
                        {item.openQuestions > 0 ? (
                          <span className="block text-xs text-amber-700 dark:text-amber-400">
                            {formatNumber(item.openQuestions)} esperando
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {item.lastAnalysis ? (
                          <Link href={`/melhorias/${item.lastAnalysis.id}`} className="hover:text-primary hover:underline">
                            {timeAgo(item.lastAnalysis.createdAt)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.lastAnalysis ? (
                            <Link
                              href={`/melhorias/${item.lastAnalysis.id}`}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                            >
                              Ver
                            </Link>
                          ) : null}
                          <AnalyzeButton
                            accountId={item.accountId}
                            itemId={item.itemId}
                            label={item.lastAnalysis ? "De novo" : "Analisar"}
                            variant={item.lastAnalysis ? "ghost" : "default"}
                            disabledReason={disabledReason}
                            className={item.lastAnalysis ? "max-sm:hidden" : undefined}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-muted-foreground" />
              Análises feitas
            </CardTitle>
            <CardDescription>Abra uma análise para ver as sugestões e marcar o que você já mudou no anúncio.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {history.map((row) => (
                <li key={row.id}>
                  <Link href={`/melhorias/${row.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <ItemThumb src={row.thumbnail} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title ?? row.itemId}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(row.createdAt, "short")} · {row.suggestions}{" "}
                        {row.suggestions === 1 ? "sugestão" : "sugestões"}
                      </p>
                    </div>
                    {row.suggestions > 0 ? (
                      <Badge variant={row.done === row.suggestions ? "default" : "outline"}>
                        {row.done} de {row.suggestions} feitas
                      </Badge>
                    ) : null}
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
