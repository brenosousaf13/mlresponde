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

const config = {
  questions: { label: "Perguntas recebidas", color: "var(--chart-1)" },
  ai_calls: { label: "Chamadas à IA", color: "var(--chart-2)" },
  ai_failed: { label: "Falhas da IA", color: "var(--destructive)" },
} satisfies ChartConfig

const hourFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", timeZone: "America/Sao_Paulo" })

/** Volume das últimas 24 horas, hora a hora. */
export function HourlyChart({ points }: { points: { hour: string; questions: number; ai_calls: number; ai_failed: number }[] }) {
  const data = points.map((point) => ({ ...point, label: `${hourFormat.format(new Date(point.hour))}h` }))
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" className="min-w-48" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="questions" fill="var(--color-questions)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="ai_calls" fill="var(--color-ai_calls)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="ai_failed" fill="var(--color-ai_failed)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
