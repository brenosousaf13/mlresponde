import { AlertTriangleIcon, HandCoinsIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { RefreshRecoveryButton } from "@/components/recuperador/recovery-buttons"
import { RecoveryTabs } from "@/components/recuperador/recovery-tabs"
import { ReviewBanner } from "@/components/recuperador/review-banner"
import { ReturnsList } from "@/components/recuperador/returns-list"
import { SummaryCards, WaitingCard } from "@/components/recuperador/summary-cards"
import { Findings, XrayProgress } from "@/components/recuperador/xray"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSection } from "@/lib/dal/app-context"
import {
  getFindings,
  getRecoveryOverview,
  getReturnsTab,
  parseRecoveryTab,
  parseReturnFilter,
  type RecoveryTab,
  type ReturnFilter,
} from "@/lib/dal/recovery"
import { timeAgo } from "@/lib/format"
import { recoveryHref } from "@/lib/recovery/presentation"
import { classifySyncHealth } from "@/lib/recovery/sync-health"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Recuperador" }
// "Atualizar agora" (Server Action desta página) lê as devoluções no Mercado Livre.
export const maxDuration = 60

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

export default async function RecoveryPage({ searchParams }: PageProps<"/recuperador">) {
  const context = await requireSection("recuperador")
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
    nickname: account.nickname || "Conta " + account.ml_user_id,
    usable: account.status === "active" && account.token_status === "valid",
    active: account.status === "active",
    tokenValid: account.token_status === "valid",
  }))
  const requested = typeof params.conta === "string" ? accounts.find((account) => account.id === params.conta) : undefined
  const account = requested ?? accounts.find((item) => item.usable) ?? accounts[0]
  if (!account) return null

  const now = new Date()
  const tab = parseRecoveryTab(params.aba)
  const filter = parseReturnFilter(params.filtro)
  const [overview, rows, findings] = await Promise.all([
    getRecoveryOverview(account.id),
    tab === "devolucoes" ? getReturnsTab(account.id, filter) : null,
    tab === "raio-x" ? getFindings(account.id) : null,
  ])
  const accountParam = accounts.length > 1 ? account.id : null
  // Por que a leitura parou (token, teste vencido ou rodada parada), em linguagem simples.
  const health = classifySyncHealth({
    now,
    accountActive: account.active,
    tokenValid: account.tokenValid,
    hasAccess: context.access.state !== "blocked",
    trialEndsAt: context.access.trialEndsAt,
    sync: overview.sync,
  })
  const loading = !overview.sync?.last_returns_at || overview.scan?.status !== "done"
  const href = (next: RecoveryTab, nextFilter?: ReturnFilter) => recoveryHref(accountParam, next, nextFilter)

  return (
    <>
      <PageHeader
        title="Recuperador"
        description="Devoluções revisadas pelo celular em 1 minuto e o Raio-X do dinheiro que ficou para trás."
        actions={
          <>
            {accounts.length > 1 ? <AccountSelect accounts={accounts} value={account.id} resetParams={["filtro"]} /> : null}
            <RefreshRecoveryButton accountId={account.id} disabled={!account.usable} />
          </>
        }
      />

      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HandCoinsIcon className="size-3.5" />
          {overview.sync?.last_returns_at ? "Atualizado " + timeAgo(overview.sync.last_returns_at, now) : "Aguardando a primeira leitura"}
        </span>
        <span>Alertas por e-mail: os mesmos do Escudo de Reputação (liga e desliga na tela Reputação).</span>
      </div>

      <ReviewBanner
        count={overview.waiting.count}
        amount={overview.waiting.actionableAmount}
        nextDeadline={overview.waiting.nextDeadline}
        href={href("devolucoes", "revisar")}
      />

      <RecoveryTabs active={tab} waiting={overview.counts.revisar} hrefFor={(key) => href(key)} />

      {health.status !== "ok" ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>
            {health.status === "token_invalido"
              ? "Esta conta não está conectada"
              : health.status === "sem_acesso"
                ? "O Recuperador está pausado"
                : "O Recuperador está sem ler as devoluções"}
          </AlertTitle>
          <AlertDescription>{health.message}</AlertDescription>
        </Alert>
      ) : null}

      {health.status === "ok" && overview.sync?.last_error && overview.sync.last_error_at && Date.parse(overview.sync.last_error_at) > now.getTime() - 60 * 60 * 1000 ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Não conseguimos ler tudo no Mercado Livre agora</AlertTitle>
          <AlertDescription>A maanu tenta de novo sozinha em alguns minutos.</AlertDescription>
        </Alert>
      ) : null}

      {tab === "visao" ? (
        <>
          <SummaryCards overview={overview} hrefReturns={href("devolucoes")} hrefXray={href("raio-x")} now={now} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <WaitingCard overview={overview} accountId={account.id} loading={loading && !overview.waiting.count} now={now} />
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
      ) : null}

      {tab === "devolucoes" && rows ? (
        <ReturnsList
          rows={rows}
          counts={overview.counts}
          filter={filter}
          accountId={account.id}
          loading={loading && rows.length === 0 && filter !== "revisar"}
          now={now}
          hrefFor={(key) => href("devolucoes", key)}
        />
      ) : null}

      {tab === "raio-x" && findings ? (
        <>
          <XrayProgress overview={overview} />
          <Findings findings={findings} accountId={account.id} />
        </>
      ) : null}
    </>
  )
}
