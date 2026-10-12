import { LightbulbIcon, MessagesSquareIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { formatNumber } from "@/lib/results/format"
import type { TopicSummary } from "@/lib/results/metrics"

/** Assuntos mais perguntados, identificados pelas palavras das perguntas. */
export function TopicsCard({ topics, total, sampled }: { topics: TopicSummary[]; total: number; sampled: boolean }) {
  const visible = topics.slice(0, 6)
  const top = topics.find((topic) => topic.id !== "outros" && topic.tip)

  return (
    <Card>
      <CardHeader>
        <CardTitle>O que os compradores mais perguntam</CardTitle>
        <CardDescription>Os assuntos que mais aparecem valem ir para o título, a ficha técnica ou a descrição do anúncio.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {visible.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquareIcon />
              </EmptyMedia>
              <EmptyTitle>Sem perguntas no período</EmptyTitle>
              <EmptyDescription>Os assuntos aparecem aqui conforme as perguntas chegam.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-4">
            {visible.map((topic) => (
              <li key={topic.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{topic.label}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {topic.share}% · {formatNumber(topic.count)}
                  </span>
                </div>
                <Progress
                  value={topic.share}
                  aria-label={`${topic.label}: ${topic.share}%`}
                  className={topic.id === "outros" ? "[&_[data-slot=progress-indicator]]:bg-muted-foreground/40" : undefined}
                />
                {topic.examples[0] ? (
                  <p className="truncate text-xs text-muted-foreground" title={topic.examples.join(" · ")}>
                    Ex.: &ldquo;{topic.examples[0]}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {top ? (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <LightbulbIcon className="size-4 text-primary" />
            Dica: {top.tip}
          </p>
          <p className="text-xs text-muted-foreground">
            Identificado pelas palavras de {formatNumber(total)} perguntas{sampled ? " (as mais recentes do período)" : ""}.
          </p>
        </CardFooter>
      ) : null}
    </Card>
  )
}