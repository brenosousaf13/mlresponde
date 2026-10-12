"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatTokens, formatUsd, longDay, shortDay } from "@/lib/admin/format"

type Kind = "count" | "usd" | "tokens"

function format(kind: Kind, value: number) {
  if (kind === "usd") return formatUsd(value)
  if (kind === "tokens") return formatTokens(value)
  return new Intl.NumberFormat("pt-BR").format(value)
}

/** Barras por dia (cadastros, custo de IA, tokens...). */
export function DailyChart({
  points,
  label,
  kind = "count",
  color = "var(--chart-1)",
  className = "aspect-auto h-56 w-full",
}: {
  points: { day: string; value: number }[]
  label: string
  kind?: Kind
  color?: string
  className?: string
}) {
  const config = { value: { label, color } } satisfies ChartConfig
  const data = points.map((point) => ({ ...point, short: shortDay(point.day) }))

  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={data.length > 45 ? 1 : "20%"}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="short" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={kind === "usd" ? 84 : 40}
          allowDecimals={kind !== "count"}
          tickFormatter={(value: number) => format(kind, value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as { day: string } | undefined
                return point ? longDay(point.day) : null
              }}
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{format(kind, Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
