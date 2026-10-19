import {
  BadgePercentIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  GaugeIcon,
  MessageSquareWarningIcon,
  PackageCheckIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { formatMoney } from "@/lib/customers/presentation"
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/format"
import type { ReputationPageData } from "@/lib/dal/reputation"
import {
  RISK_BADGE,
  RISK_LABELS,
  RISK_ORDER,
  claimHref,
  logisticLabel,
  mlSaleUrl,
} from "@/lib/reputation/presentation"
import { shipmentRisk } from "@/lib/reputation/shipments"
import { COLOR_PERKS, METRIC_LABELS } from "@/lib/reputation/thresholds"
import { cn } from "@/lib/utils"

const ALERT_ICONS: Record<string, LucideIcon> = {
  shipment_late: TruckIcon,
  shipment_at_risk: TruckIcon,
  margin_low: GaugeIcon,
  color_dropped: TrendingDownIcon,
  color_recovered: TrendingUpIcon,
  claim_new: MessageSquareWarningIcon,
  claim_due_soon: CalendarClockIcon,
  claim_exclusion: MessageSquareWarningIcon,
  claim_excluded: CheckCircle2Icon,
}

function claimRowId(data: unknown): string | null {
  const value = data && typeof data === "object" ? (data as { claim_row_id?: unknown }).claim_row_id : null
  return typeof value === "string" ? value : null
}

/** "Precisa de você agora": alertas abertos da conta (urgentes primeiro). */
export function AlertsCard({ alerts, accountId }: { alerts: ReputationPageData["alerts"]; accountId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Precisa de você agora</CardTitle>
        <CardDescription>Os alertas somem sozinhos quando a situação acaba.</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-medium">Tudo em dia</p>
              <p className="text-sm text-muted-foreground">Nenhum alerta aberto nesta conta.</p>
            </div>
          </div>
        ) : (
          <ItemGroup className="gap-2">
            {alerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.kind] ?? GaugeIcon
              const urgent = alert.severity === "urgent"
              return (
                <Item key={alert.id} variant="outline" size="sm" className="items-start bg-card">
                  <ItemMedia
                    className={cn(
                      "size-8 rounded-lg",
                      urgent ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    <Icon className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="line-clamp-none">{alert.title}</ItemTitle>
                    <ItemDescription className="line-clamp-none">{alert.body}</ItemDescription>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {timeAgo(alert.opened_at)}
                      {claimRowId(alert.data) ? (
                        <Link href={claimHref(claimRowId(alert.data) as string, accountId)} className="font-medium text-primary hover:underline">
                          Abrir reclamação
                        </Link>
                      ) : null}
                    </span>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

/** Envios esperando o vendedor despachar, do que vence primeiro. */
export function ShipmentsCard({ shipments, now }: { shipments: ReputationPageData["shipments"]; now: Date }) {
  const rows = shipments
    .map((shipment) => ({ ...shipment, risk: shipmentRisk(shipment.sla_expected_at, now) }))
    .sort((a, b) =>
      RISK_ORDER[a.risk] !== RISK_ORDER[b.risk]
        ? RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
        : Date.parse(a.sla_expected_at ?? "9999") - Date.parse(b.sla_expected_at ?? "9999")
    )
  const late = rows.filter((row) => row.risk === "late").length
  const atRisk = rows.filter((row) => row.risk === "at_risk").length
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <TruckIcon className="size-4" />
          Despachos
        </CardTitle>
        <CardDescription>
          {rows.length === 0
            ? "Envios das vendas pagas esperando você despachar."
            : formatNumber(rows.length) +
              (rows.length === 1 ? " envio esperando" : " envios esperando") +
              (late ? " · " + late + (late === 1 ? " atrasado" : " atrasados") : "") +
              (atRisk ? " · " + atRisk + " vence" + (atRisk === 1 ? "" : "m") + " logo" : "")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <div className="mx-4 flex items-center gap-3 rounded-xl border border-dashed p-4">
            <PackageCheckIcon className="size-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">Nenhum envio esperando despacho agora.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.slice(0, 30).map((row) => {
              const url = mlSaleUrl(row.pack_id ?? row.ml_order_id)
              const logistic = logisticLabel(row.logistic_type)
              return (
                <li key={row.shipment_id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={row.item_title ?? undefined}>
                      {row.item_title || "Venda " + (row.ml_order_id ?? row.shipment_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.sla_expected_at
                        ? "Despachar até " + formatDateTime(row.sla_expected_at) + " (" + timeAgo(row.sla_expected_at, now) + ")"
                        : "O ML ainda não informou o prazo"}
                      {logistic ? " · " + logistic : ""}
                    </p>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Abrir a venda no ML
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    ) : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", RISK_BADGE[row.risk])}>
                    {RISK_LABELS[row.risk]}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter className="mt-auto border-t bg-muted/30 py-3 text-xs text-muted-foreground">
        Envios Full ficam com o ML e não aparecem aqui. Conferimos no ML a cada 10 a 30 minutos.
      </CardFooter>
    </Card>
  )
}

/** Quando as reclamações que contam saem da conta da reputação (estimativa: data da venda + período). */
export function ForecastCard({
  forecast,
  claimsValue,
  periodDays,
  searching,
}: {
  forecast: ReputationPageData["forecast"]
  claimsValue: number
  periodDays: number | null
  searching: boolean
}) {
  const labels = METRIC_LABELS.claims
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          Quando as reclamações saem da conta
        </CardTitle>
        <CardDescription>
          Cada reclamação deixa de contar {periodDays ?? 365} dias depois da venda (estimativa).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {searching ? (
          <p className="text-sm text-muted-foreground">Buscando as suas reclamações no Mercado Livre...</p>
        ) : forecast.entries.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">
              {claimsValue > 0
                ? "O ML conta " + claimsValue + " " + (claimsValue === 1 ? labels.singular : labels.plural) + ", mas ainda não encontramos as datas."
                : "Nenhuma reclamação contando na sua reputação agora."}
            </p>
          </div>
        ) : (
          <ol className="relative flex flex-col gap-3 border-l pl-4">
            {forecast.entries.slice(0, 12).map((entry) => (
              <li key={entry.day} className="relative">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                <p className="text-sm font-medium">{formatDate(entry.date)}</p>
                <p className="text-sm text-muted-foreground">
                  Sai{entry.claims.length > 1 ? "em" : ""} {entry.claims.length}{" "}
                  {entry.claims.length === 1 ? labels.singular : labels.plural} ·{" "}
                  {entry.remaining === 0
                    ? "nenhuma continua contando"
                    : entry.remaining + (entry.remaining === 1 ? " continua contando" : " continuam contando")}
                </p>
              </li>
            ))}
          </ol>
        )}
        {!searching && forecast.counted > 0 && claimsValue > forecast.counted ? (
          <p className="text-xs text-muted-foreground">
            O ML conta {claimsValue} {labels.plural}; encontramos a data de {forecast.counted}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Quanto a cor vale em R$ (desconto do frete) ou, sem dados, o que cada cor tranca. */
export function ColorValueCard({ value }: { value: ReputationPageData["colorValue"] }) {
  const hasValue = value.discount > 0
  return (
    <Card className={cn(hasValue && "bg-linear-to-t from-primary/[0.06] to-card")}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <BadgePercentIcon className="size-4" />
          Quanto vale a sua cor
        </CardDescription>
        {hasValue ? (
          <>
            <CardTitle className="text-3xl font-semibold tabular-nums">{formatMoney(value.discount)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              de desconto no frete que o ML deu{" "}
              {value.coveredDays >= 30 || !value.since ? "nos últimos 30 dias" : "desde " + formatDate(value.since, "short")} (
              {formatNumber(value.shipments)} {value.shipments === 1 ? "envio" : "envios"})
            </p>
          </>
        ) : (
          <CardTitle>O que cada cor libera</CardTitle>
        )}
      </CardHeader>
      <CardContent>
        {hasValue ? (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm">
              No laranja ou vermelho, você pagaria até{" "}
              <span className="font-semibold">{formatMoney(value.monthlyEstimate)} a mais por mês</span> de frete (estimativa:
              a tabela dessas cores não tem desconto).
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {COLOR_PERKS.map((perk) => (
              <li key={perk.title} className="text-sm">
                <span className="font-medium">{perk.title}.</span> <span className="text-muted-foreground">{perk.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {hasValue ? null : (
        <CardFooter className="text-xs text-muted-foreground">
          O valor em R$ aparece aqui quando houver envios despachados com desconto no frete.
        </CardFooter>
      )}
    </Card>
  )
}
