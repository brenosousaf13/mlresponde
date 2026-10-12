import { ArrowRightIcon, MessagesSquareIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { AfterSaleSummary } from "@/lib/dal/after-sale"
import { formatNumber, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Resumo do pós-venda no Painel (só aparece para quem tem o plano). */
export function AfterSaleSummaryCard({ summary, days }: { summary: AfterSaleSummary; days: number }) {
  const waitingCount = summary.waiting
  const agentOn = summary.agentOn

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <MessagesSquareIcon className="size-4" />
          Pós-venda
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {waitingCount ? `${formatNumber(waitingCount)} esperando você` : "Nenhum comprador esperando"}
        </CardTitle>
        <CardAction>
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", agentOn ? "text-brand-teal-ink" : "text-muted-foreground")}>
            <span className={cn("size-2 rounded-full", agentOn ? "bg-brand-teal" : "bg-muted-foreground/40")} />
            {agentOn ? "Agente ligado" : "Agente pausado"}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {pluralize(summary.conversations, "conversa", "conversas")} nos últimos {days} dias ·{" "}
        {pluralize(summary.answeredByAgent, "respondida pelo agente", "respondidas pelo agente")}.
      </CardContent>
      <CardFooter className="mt-auto">
        <Link href="/pos-venda" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {waitingCount ? "Responder" : "Abrir pós-venda"}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </CardFooter>
    </Card>
  )
}
