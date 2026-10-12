"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DailyPoint } from "@/lib/results/metrics"

const config = {
  ai: { label: "Pela IA", color: "var(--chart-1)" },
  human: { label: "Por você", color: "var(--chart-2)" },
  open: { label: "Aguardando", color: "oklch(0.769 0.188 70.08)" },
} satisfies ChartConfig

/** Perguntas por dia, empilhadas por quem respondeu. */
export function DailyChart({ points }: { points: DailyPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={points} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={points.length > 45 ? 1 : "20%"}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as DailyPoint | undefined
                return point ? `${point.fullLabel} · ${point.total} pergunta${point.total === 1 ? "" : "s"}` : null
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="ai" stackId="a" fill="var(--color-ai)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="human" stackId="a" fill="var(--color-human)" />
        <Bar dataKey="open" stackId="a" fill="var(--color-open)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}