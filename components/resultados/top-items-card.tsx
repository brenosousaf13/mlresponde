import { ArrowRightIcon, ExternalLinkIcon, PackageSearchIcon } from "lucide-react"
import Link from "next/link"

import { ItemThumb } from "@/components/perguntas/question-detail"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/results/format"
import { share, type ItemRow } from "@/lib/results/metrics"

function questionsHref(item: ItemRow) {
  const params = new URLSearchParams({ aba: "todas" })
  if (item.title) params.set("busca", item.title.slice(0, 60))
  return `/perguntas?${params.toString()}`
}

/** Anúncios que mais recebem perguntas, com quanto a IA resolveu em cada um. */
export function TopItemsCard({ items, total }: { items: ItemRow[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anúncios com mais perguntas</CardTitle>
        <CardDescription>
          Onde os compradores mais têm dúvidas. Anúncio com muita pergunta pode estar com informação faltando.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {items.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearchIcon />
              </EmptyMedia>
              <EmptyTitle>Sem perguntas no período</EmptyTitle>
              <EmptyDescription>Os anúncios aparecem aqui assim que receberem perguntas.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Anúncio</TableHead>
                <TableHead className="w-20 text-right sm:w-24">Perguntas</TableHead>
                <TableHead className="hidden w-56 md:table-cell">Resolvidas pela IA</TableHead>
                <TableHead className="hidden w-28 text-right sm:table-cell">Aguardando</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const aiShare = share(item.ai, item.total)
                return (
                  <TableRow key={item.itemId}>
                    <TableCell className="pl-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="hidden w-4 shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">{index + 1}</span>
                        <ItemThumb src={item.thumbnail} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={item.title ?? item.itemId}>
                            {item.title ?? item.itemId}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            {item.itemId}
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
                      <span className="font-medium">{formatNumber(item.total)}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{share(item.total, total)}% do total</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <Progress value={aiShare} className="flex-1" aria-label={`${aiShare}% resolvidas pela IA`} />
                        <span className="w-9 text-right text-xs tabular-nums">{aiShare}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {item.open > 0 ? (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                          {formatNumber(item.open)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <Link
                        href={questionsHref(item)}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Ver perguntas de ${item.title ?? item.itemId}`}
                        title="Ver perguntas"
                      >
                        <ArrowRightIcon className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}