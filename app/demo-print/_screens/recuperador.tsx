import { HandCoinsIcon } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { RefreshRecoveryButton } from "@/components/recuperador/recovery-buttons"
import { RecoveryTabs } from "@/components/recuperador/recovery-tabs"
import { ReturnsList } from "@/components/recuperador/returns-list"
import { SummaryCards, WaitingCard } from "@/components/recuperador/summary-cards"
import { Findings, XrayProgress } from "@/components/recuperador/xray"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { RecoveryTab } from "@/lib/dal/recovery"
import { recoveryHref } from "@/lib/recovery/presentation"

import { DEMO_ACCOUNT_ID, FINDINGS, OVERVIEW, WAITING_ROWS } from "../_data"

const STEPS = [
  {
    title: "Avisamos quando dá para recuperar",
    body: "Quando a devolução chega até você e quando o armazém do ML devolve o dinheiro ao comprador, com o prazo para agir.",
  },
  {
    title: "Você resolve pelo celular",
    body: "Chegou certinho? 1 toque. Chegou com problema ou quer contestar o armazém? Escolha o motivo, tire as fotos e a IA escreve o relato.",
  },
  {
    title: "O Raio-X procura dinheiro perdido",
    body: "Lê as devoluções dos últimos 90 dias e mostra onde o produto voltou sem condição de venda e o dinheiro foi para o comprador.",
  },
]

function Header() {
  return (
    <>
      <PageHeader
        title="Recuperador"
        description="Devoluções revisadas pelo celular em 1 minuto e o Raio-X do dinheiro que ficou para trás."
        actions={<RefreshRecoveryButton accountId={DEMO_ACCOUNT_ID} />}
      />
      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HandCoinsIcon className="size-3.5" />
          Atualizado há 2 minutos
        </span>
        <span>Alertas por e-mail: os mesmos do Escudo de Reputação (liga e desliga na tela Reputação).</span>
      </div>
    </>
  )
}

const href = (tab: RecoveryTab) => recoveryHref(null, tab)

export function RecoveryOverviewScreen() {
  const now = new Date()
  return (
    <>
      <Header />
      <RecoveryTabs active="visao" waiting={OVERVIEW.counts.revisar} hrefFor={href} />
      <SummaryCards overview={OVERVIEW} hrefReturns={href("devolucoes")} hrefXray={href("raio-x")} now={now} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <WaitingCard overview={OVERVIEW} accountId={DEMO_ACCOUNT_ID} loading={false} now={now} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Como funciona</CardTitle>
            <CardDescription>Nada é enviado ao Mercado Livre sem o seu clique.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export function RecoveryReturnsScreen() {
  const now = new Date()
  return (
    <>
      <Header />
      <RecoveryTabs active="devolucoes" waiting={OVERVIEW.counts.revisar} hrefFor={href} />
      <ReturnsList
        rows={WAITING_ROWS}
        counts={OVERVIEW.counts}
        filter="revisar"
        accountId={DEMO_ACCOUNT_ID}
        loading={false}
        now={now}
        hrefFor={(key) => recoveryHref(null, "devolucoes", key)}
      />
    </>
  )
}

export function RecoveryXrayScreen() {
  return (
    <>
      <Header />
      <RecoveryTabs active="raio-x" waiting={OVERVIEW.counts.revisar} hrefFor={href} />
      <XrayProgress overview={OVERVIEW} />
      <Findings findings={FINDINGS} accountId={DEMO_ACCOUNT_ID} />
    </>
  )
}
