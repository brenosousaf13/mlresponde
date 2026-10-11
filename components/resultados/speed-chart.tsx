"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SpeedPoint } from "@/lib/results/metrics"

const config = {
  ai: { label: "IA", color: "var(--chart-1)" },
  human: { label: "Você", color: "oklch(0.696 0.17 162.48)" },
} satisfies ChartConfig

const percent = (value: unknown) => (typeof value === "number" && value > 0 ? `${value}%` : "")

/** Em quanto tempo saem as respostas (em % das respostas de cada um). */
export function SpeedChart({ points, showHuman }: { points: SpeedPoint[]; showHuman: boolean }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={points} layout="vertical" margin={{ left: 4, right: 36 }} barGap={2}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={104} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name, item) => {
                const point = item.payload as SpeedPoint
                const count = name === "ai" ? point.aiCount : point.humanCount
                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{config[name as "ai" | "human"]?.label}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {String(value)}% · {count}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        {showHuman ? <ChartLegend content={<ChartLegendContent />} /> : null}
        <Bar dataKey="ai" fill="var(--color-ai)" radius={4} maxBarSize={14}>
          <LabelList dataKey="ai" position="right" className="fill-foreground" fontSize={11} formatter={percent} />
        </Bar>
        {showHuman ? (
          <Bar dataKey="human" fill="var(--color-human)" radius={4} maxBarSize={14}>
            <LabelList dataKey="human" position="right" className="fill-muted-foreground" fontSize={11} formatter={percent} />
          </Bar>
        ) : null}
      </BarChart>
    </ChartContainer>
  )
}