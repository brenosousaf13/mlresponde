import { CircleAlertIcon, CircleCheckIcon, CreditCardIcon, LandmarkIcon, TriangleAlertIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { RefreshCatalogButton, RegisterWebhookButton } from "@/components/admin/billing-buttons"
import { ToneBadge } from "@/components/admin/badges"
import { StatCard } from "@/components/admin/stat-card"
import { PageHeader } from "@/components/app/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Tone } from "@/lib/admin/labels"
import { formatBrl, formatInteger } from "@/lib/admin/format"
import { SUBSCRIPTION_EVENTS } from "@/lib/billing/abacatepay/webhook"
import { getAdminBillingOverview, getProviderStatus } from "@/lib/dal/admin-billing"
import { formatDateTime } from "@/lib/format"
import { BILLING_CYCLE_LABELS, planName, type BillingCycle } from "@/lib/plans/plans"

export const metadata: Metadata = { title: "Cobrança" }

const cents = (value: number) => formatBrl(value / 100)
const cycleLabel = (value: string) => BILLING_CYCLE_LABELS[value as BillingCycle] ?? value

const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  processed: { label: "Aplicado", tone: "teal" },
  ignored: { label: "Ignorado", tone: "slate" },
  failed: { label: "Erro", tone: "red" },
  received: { label: "Recebido", tone: "amber" },
}

const CHECKOUT_STATUS: Record<string, { label: string; tone: Tone }> = {
  creating: { label: "Criando", tone: "slate" },
  pending: { label: "Aguardando pagamento", tone: "amber" },
  paid: { label: "Pago", tone: "teal" },
  failed: { label: "Erro", tone: "red" },
  cancelled: { label: "Cancelado", tone: "slate" },
}

const IGNORED_REASONS: Record<string, string> = {
  archived: "arquivado",
  no_plan: "o nome não diz o plano (Starter, Pro ou Escala)",
  no_cycle: "sem recorrência (é avulso)",
  unsupported_cycle: "recorrência que a maanu não vende (só mensal) — pode arquivar na AbacatePay",
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <span>{children}</span>
    </li>
  )
}

export default async function AdminBillingPage() {
  const [overview, provider] = await Promise.all([getAdminBillingOverview(), getProviderStatus()])
  const { settings, catalog } = provider
  const ourWebhooks = provider.webhooks.list.filter((webhook) => webhook.endpoint.split("?")[0] === provider.endpoint)
  const missingEvents = ourWebhooks.length
    ? SUBSCRIPTION_EVENTS.filter((event) => !ourWebhooks.some((webhook) => webhook.events.includes(event)))
    : []
  const monthlyReady = catalog.catalog?.entries.filter((entry) => entry.status === "ok").length ?? 0
  const keyLabel =
    settings.keyMode === "live" ? "produção" : settings.keyMode === "test" ? "modo de teste" : settings.keyMode === "unknown" ? "formato desconhecido" : null

  return (
    <>
      <PageHeader title="Cobrança" description="Assinaturas pela AbacatePay: configuração, produtos, webhook e o que chegou." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Assinaturas ativas"
          icon={CreditCardIcon}
          value={formatInteger(overview.totals.active)}
          headline={`${formatInteger(overview.totals.cancelled)} cancelada(s)`}
          detail={overview.totals.test ? `${overview.totals.test} de teste (fora das contas)` : "Pagas pela AbacatePay"}
        />
        <StatCard
          label="MRR pela AbacatePay"
          icon={LandmarkIcon}
          value={cents(overview.totals.mrr_cents)}
          headline="Soma das mensalidades ativas"
          detail="Também entra no Financeiro (mensalidade preenchida sozinha)"
        />
        <StatCard
          label="Cobranças recusadas"
          icon={TriangleAlertIcon}
          value={formatInteger(overview.totals.payment_failed)}
          headline="A AbacatePay tenta de novo"
          detail="4 tentativas, a cada 2 dias; depois cancela"
        />
        <StatCard
          label="Trocas agendadas"
          icon={CreditCardIcon}
          value={formatInteger(overview.totals.scheduled)}
          headline="Para um plano mais barato"
          detail="Valem na próxima cobrança"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>
            Variáveis do projeto <code>maanu</code> na Vercel (Production). A chave e o segredo nunca aparecem aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            <Check ok={Boolean(keyLabel) && settings.keyMode !== "unknown"}>
              Chave de API (<code>ABACATEPAY_API_KEY</code>):{" "}
              {keyLabel ? <strong>configurada — {keyLabel}</strong> : <strong>não configurada</strong>}
              {provider.store.name ? ` · loja "${provider.store.name}"` : ""}
              {provider.store.error ? <span className="text-muted-foreground"> · loja: {provider.store.error}</span> : null}
            </Check>
            <Check ok={settings.webhookSecretValid}>
              Segredo do webhook (<code>ABACATEPAY_WEBHOOK_SECRET</code>):{" "}
              <strong>{settings.webhookSecretValid ? "configurado" : "não configurado (mínimo 32 caracteres)"}</strong>
            </Check>
            <Check ok={monthlyReady === 3}>
              Produtos prontos para venda: <strong>{monthlyReady} de 3</strong> (Starter, Pro e Escala, mensais)
              {catalog.error ? <span className="text-muted-foreground"> · {catalog.error}</span> : null}
            </Check>
            <Check ok={ourWebhooks.length > 0 && missingEvents.length === 0}>
              Webhook na AbacatePay:{" "}
              <strong>
                {ourWebhooks.length
                  ? missingEvents.length
                    ? `cadastrado, mas sem ${missingEvents.join(", ")}`
                    : `cadastrado${ourWebhooks.some((webhook) => webhook.devMode) ? " (modo de teste)" : ""}`
                  : provider.webhooks.error
                    ? `não foi possível conferir (${provider.webhooks.error})`
                    : "não cadastrado"}
              </strong>
            </Check>
            <Check ok={settings.enabled}>
              Contratação pelo app: <strong>{settings.enabled ? "ligada" : "desligada (aparece “em breve” para os clientes)"}</strong>
              {settings.enabled && settings.keyMode !== "live"
                ? " · com chave de teste, só administradores e os e-mails de ABACATEPAY_TEST_EMAILS conseguem assinar"
                : ""}
            </Check>
          </ul>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Endereço do webhook:</span>
            <code className="break-all">{provider.endpoint}</code>
            {ourWebhooks.length === 0 ? (
              <RegisterWebhookButton disabled={!settings.apiKeyConfigured || !settings.webhookSecretValid} />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Formas de pagamento oferecidas: {settings.methods.map((method) => (method === "PIX" ? "PIX Automático" : "cartão de crédito")).join(" e ")}
            . Permissões da chave: PRODUCT:READ, CUSTOMER:CREATE, SUBSCRIPTION:CREATE, SUBSCRIPTION:READ, SUBSCRIPTION:DELETE,
            WEBHOOK:CREATE, WEBHOOK:READ e STORE:READ.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtos na AbacatePay</CardTitle>
          <CardDescription>
            Cada plano precisa de um produto ativo com recorrência mensal, com &quot;Starter&quot;, &quot;Pro&quot; ou
            &quot;Escala&quot; no nome e o mesmo preço da maanu. Preço diferente não é usado (o cliente nunca paga outro valor).
            {catalog.fetchedAt ? ` Lidos em ${formatDateTime(catalog.fetchedAt)}.` : ""}
          </CardDescription>
          <CardAction>
            <RefreshCatalogButton />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {catalog.catalog ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead>Preço da maanu</TableHead>
                    <TableHead>Produto na AbacatePay</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.catalog.entries.map((entry) => (
                    <TableRow key={`${entry.plan}-${entry.cycle}`}>
                      <TableCell className="font-medium">{planName(entry.plan)}</TableCell>
                      <TableCell>{cycleLabel(entry.cycle)}</TableCell>
                      <TableCell className="tabular-nums">{cents(entry.expectedCents)}</TableCell>
                      <TableCell>
                        {entry.product ? (
                          <span className="flex flex-col">
                            <span>
                              {entry.product.name} · <span className="tabular-nums">{cents(entry.product.price)}</span>
                            </span>
                            <code className="text-xs text-muted-foreground">{entry.product.id}</code>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.status === "ok" ? (
                          <ToneBadge tone="teal">Pronto{entry.duplicates ? ` (+${entry.duplicates} igual)` : ""}</ToneBadge>
                        ) : entry.status === "price_mismatch" ? (
                          <ToneBadge tone="red">Preço diferente</ToneBadge>
                        ) : (
                          <ToneBadge tone="amber">Não encontrado</ToneBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {settings.apiKeyConfigured ? "Não foi possível ler os produtos agora." : "Configure a chave de API para ler os produtos."}
            </p>
          )}
          {catalog.catalog?.ignored.length ? (
            <div className="text-sm">
              <p className="font-medium">Produtos ignorados</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {catalog.catalog.ignored.map(({ product, reason }) => (
                  <li key={product.id}>
                    {product.name || product.id} ({cents(product.price)}) — {IGNORED_REASONS[reason] ?? reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assinaturas</CardTitle>
          <CardDescription>A assinatura atual de cada cliente na AbacatePay (as 100 mais recentes).</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.subscriptions.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Pago até</TableHead>
                    <TableHead>Atualizada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.subscriptions.map((row) => (
                    <TableRow key={row.organization_id}>
                      <TableCell>
                        <Link href={`/admin/clientes/${row.organization_id}`} className="font-medium hover:underline">
                          {row.organization_name}
                        </Link>
                        {row.dev_mode ? <ToneBadge tone="violet" className="ml-2">Teste</ToneBadge> : null}
                      </TableCell>
                      <TableCell>
                        {planName(row.plan)} · {cycleLabel(row.cycle)}
                        {row.scheduled_plan ? <span className="text-muted-foreground"> → {planName(row.scheduled_plan)}</span> : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{cents(row.amount_cents)}</TableCell>
                      <TableCell>
                        {row.status === "cancelled" ? (
                          <ToneBadge tone="slate">Cancelada</ToneBadge>
                        ) : row.payment_failed_at ? (
                          <ToneBadge tone="red">Recusada ({row.payment_failures}x)</ToneBadge>
                        ) : (
                          <ToneBadge tone="teal">Ativa</ToneBadge>
                        )}
                      </TableCell>
                      <TableCell>{row.current_period_end ? formatDateTime(row.current_period_end) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(row.updated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma assinatura ainda.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notificações recebidas</CardTitle>
            <CardDescription>Webhooks da AbacatePay (as 50 mais recentes).</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.events.length ? (
              <ul className="flex flex-col divide-y text-sm">
                {overview.events.map((event) => {
                  const status = EVENT_STATUS[event.status] ?? { label: event.status, tone: "slate" as Tone }
                  return (
                    <li key={event.id} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs">{event.event}</code>
                        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                        {event.dev_mode ? <ToneBadge tone="violet">Teste</ToneBadge> : null}
                        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(event.received_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {event.organization_name ? `${event.organization_name} · ` : ""}
                        {event.note ?? "—"}
                        {event.attempts && event.attempts > 1 ? ` · ${event.attempts} tentativas` : ""}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>Nenhuma notificação ainda</AlertTitle>
                <AlertDescription>Elas aparecem aqui quando alguém assinar, renovar ou cancelar.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Páginas de pagamento</CardTitle>
            <CardDescription>Checkouts criados pelo app (os 50 mais recentes).</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.checkouts.length ? (
              <ul className="flex flex-col divide-y text-sm">
                {overview.checkouts.map((checkout) => {
                  const status = CHECKOUT_STATUS[checkout.status] ?? { label: checkout.status, tone: "slate" as Tone }
                  return (
                    <li key={checkout.id} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{checkout.organization_name}</span>
                        <span className="text-muted-foreground">
                          {planName(checkout.plan)} · {cycleLabel(checkout.cycle)} · {cents(checkout.amount_cents)}
                        </span>
                        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                        {checkout.dev_mode ? <ToneBadge tone="violet">Teste</ToneBadge> : null}
                        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(checkout.created_at)}</span>
                      </div>
                      {checkout.error ? <p className="text-xs text-destructive">{checkout.error}</p> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma página de pagamento criada ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}