import { AlertTriangleIcon, LoaderIcon, ShieldCheckIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { ClaimsList } from "@/components/reputacao/claims-list"
import { EmailAlertsSwitch } from "@/components/reputacao/email-alerts-switch"
import { HowItWorks } from "@/components/reputacao/how-it-works"
import { AlertsCard, ColorValueCard, ForecastCard, ShipmentsCard } from "@/components/reputacao/overview-cards"
import { RefreshReputationButton } from "@/components/reputacao/refresh-button"
import { ReputationTabs, parseReputationTab, type ReputationTab } from "@/components/reputacao/reputation-tabs"
import { ThermometerCard } from "@/components/reputacao/thermometer-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { getReputationPage } from "@/lib/dal/reputation"
import { countOpenClaims, getClaimsTab, parseClaimFilter, type ClaimFilter } from "@/lib/dal/reputation-claims"
import { timeAgo } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Reputação" }
// "Atualizar agora" (Server Action desta página) lê o termômetro, os envios e as reclamações no Mercado Livre.
export const maxDuration = 60

export default async function ReputationPage({ searchParams }: PageProps<"/reputacao">) {
  const context = await requireSection("reputacao")
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
  }))
  const requested = typeof params.conta === "string" ? accounts.find((account) => account.id === params.conta) : undefined
  const account = requested ?? accounts.find((item) => item.usable) ?? accounts[0]
  if (!account) return null

  const now = new Date()
  const tab = parseReputationTab(params.aba)
  const filter = parseClaimFilter(params.filtro)
  const [data, claimCounts, claimsTab] = await Promise.all([
    getReputationPage(organizationId, account.id, now),
    countOpenClaims(account.id),
    tab === "reclamacoes" ? getClaimsTab(account.id, filter) : null,
  ])
  const updatedAt = data.sync?.last_reputation_at ?? data.snapshot?.captured_at ?? null

  /** Link para outra aba ou filtro, mantendo a conta escolhida. */
  function href(next: { tab: ReputationTab; filter?: ClaimFilter }) {
    const query = new URLSearchParams()
    if (accounts.length > 1) query.set("conta", account.id)
    if (next.tab === "reclamacoes") {
      query.set("aba", "reclamacoes")
      if (next.filter && next.filter !== "precisam") query.set("filtro", next.filter)
    }
    const search = query.toString()
    return search ? "/reputacao?" + search : "/reputacao"
  }

  return (
    <>
      <PageHeader
        title="Escudo de Reputação"
        description="Quanto falta para a sua cor cair, os despachos perto do prazo e quando cada reclamação sai da conta."
        actions={
          <>
            {accounts.length > 1 ? <AccountSelect accounts={accounts} value={account.id} resetParams={["filtro"]} /> : null}
            <RefreshReputationButton accountId={account.id} disabled={!account.usable} />
          </>
        }
      />

      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3.5" />
          {updatedAt ? "Atualizado " + timeAgo(updatedAt, now) : "Aguardando a primeira leitura"}
        </span>
        <EmailAlertsSwitch enabled={data.emailAlerts} canManage={canManageOrganization(context.role)} />
      </div>

      <ReputationTabs
        active={tab}
        openClaims={claimCounts.open}
        needsYou={claimCounts.needsYou > 0}
        hrefFor={(key) => href({ tab: key })}
      />

      {!account.usable ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Esta conta não está conectada</AlertTitle>
          <AlertDescription>
            Reconecte a conta em Contas do Mercado Livre para a maanu voltar a acompanhar a reputação dela.
          </AlertDescription>
        </Alert>
      ) : null}

      {data.sync?.last_error && data.sync.last_error_at && Date.parse(data.sync.last_error_at) > now.getTime() - 60 * 60 * 1000 ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Não conseguimos ler tudo no Mercado Livre agora</AlertTitle>
          <AlertDescription>A maanu tenta de novo sozinha em alguns minutos.</AlertDescription>
        </Alert>
      ) : null}

      {claimsTab ? (
        <ClaimsList
          rows={claimsTab.rows}
          counts={claimsTab.counts}
          filter={filter}
          accountId={account.id}
          searching={!data.sync?.claims_backfilled_at}
          now={now}
          hrefFor={(key) => href({ tab: "reclamacoes", filter: key })}
        />
      ) : null}

      {tab === "visao" ? (
        <>
          {/* Termômetro à esquerda; alertas e valor da cor à direita, as duas colunas com a mesma altura. */}
          <div className="grid gap-4 xl:grid-cols-3">
            {data.reading && data.slack ? (
              <ThermometerCard reading={data.reading} slack={data.slack} className="xl:col-span-2" />
            ) : (
              <Card className="justify-center xl:col-span-2">
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <LoaderIcon />
                    </EmptyMedia>
                    <EmptyTitle>Lendo a reputação desta conta</EmptyTitle>
                    <EmptyDescription>
                      A maanu busca o termômetro, os envios e as reclamações no Mercado Livre. Leva cerca de um minuto na primeira
                      vez.
                    </EmptyDescription>
                  </EmptyHeader>
                  {account.usable ? (
                    <EmptyContent>
                      <RefreshReputationButton accountId={account.id} />
                    </EmptyContent>
                  ) : null}
                </Empty>
              </Card>
            )}
            {/* No computador, a coluna da direita tem exatamente a altura do termômetro: os alertas ocupam o que sobra
                (mínimo 13rem) e as listas rolam por dentro. Em telas médias, os dois cartões ficam lado a lado. */}
            <div className="xl:relative xl:min-h-[32rem]">
              <div className="grid gap-4 md:grid-cols-2 xl:absolute xl:inset-0 xl:flex xl:flex-col">
                <AlertsCard alerts={data.alerts} accountId={account.id} className="xl:min-h-52 xl:flex-1" />
                <ColorValueCard value={data.colorValue} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ShipmentsCard shipments={data.shipments} now={now} />
            <ForecastCard
              forecast={data.forecast}
              claimsValue={data.reading?.metrics.claims.value ?? 0}
              periodDays={data.reading?.periodDays ?? null}
              searching={!data.sync?.claims_backfilled_at}
            />
          </div>

          <HowItWorks />
        </>
      ) : null}
    </>
  )
}
