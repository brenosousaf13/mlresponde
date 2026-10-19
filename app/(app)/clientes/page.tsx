import { ChevronRightIcon, RepeatIcon, ShieldCheckIcon, SparklesIcon, UsersIcon, WalletIcon, type LucideIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { ImportStatus } from "@/components/clientes/import-status"
import { OrderSelect } from "@/components/clientes/order-select"
import { InboxListFooter } from "@/components/perguntas/inbox-list"
import { QuestionSearch } from "@/components/perguntas/question-search"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireSection } from "@/lib/dal/app-context"
import { getCustomerSyncRows, getCustomersOverview, listCustomers } from "@/lib/dal/customers"
import {
  CUSTOMERS_PAGE_SIZE,
  CUSTOMER_FILTERS,
  CUSTOMER_ORDERS,
  customerDisplayName,
  customerInitials,
  customerLocation,
  customersHref,
  formatMoney,
  parseCustomerFilter,
  parseCustomerOrder,
  returningRate,
  summarizeSync,
  type CustomerFilter,
  type CustomerOrder,
  type CustomersState,
} from "@/lib/customers/presentation"
import { formatDate, formatNumber, timeAgo } from "@/lib/format"
import { pageRange, parsePage, sanitizeSearch } from "@/lib/questions/presentation"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Clientes" }

type Kpi = { label: string; icon: LucideIcon; value: string; badge?: string | null; headline: string; detail: string }

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const context = await requireSection("clientes")
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
    usable: account.status === "active" && account.token_status !== "invalid",
  }))
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const state: CustomersState = {
    account: typeof params.conta === "string" && accountById.has(params.conta) ? params.conta : null,
    search: sanitizeSearch(params.q),
    filter: parseCustomerFilter(params.filtro),
    order: parseCustomerOrder(params.ordem),
    page: parsePage(params.pagina),
  }
  const href = (change: Partial<CustomersState>) => customersHref({ ...state, page: 1, ...change })
  const scopedAccounts = state.account ? accounts.filter((account) => account.id === state.account) : accounts
  const showAccount = accounts.length > 1 && !state.account

  const [overview, list, syncRows] = await Promise.all([
    getCustomersOverview(organizationId, state.account),
    listCustomers(organizationId, state),
    getCustomerSyncRows(organizationId),
  ])
  // Página que deixou de existir (ex.: mudou o filtro): volta para a primeira.
  if (list.error?.code === "PGRST103" && state.page > 1) redirect(href({ page: 1 }))
  if (list.error) throw list.error

  const sync = summarizeSync(syncRows, scopedAccounts)
  const { from, to, totalPages } = pageRange(state.page, CUSTOMERS_PAGE_SIZE, list.total)
  const rate = returningRate(overview.customers, overview.returning)
  const average = overview.customers > 0 ? overview.totalSpent / overview.customers : 0
  const filtered = Boolean(state.search) || state.filter !== "todos"

  const kpis: Kpi[] = [
    {
      label: "Clientes",
      icon: UsersIcon,
      value: formatNumber(overview.customers),
      headline: "Compraram pelo menos uma vez",
      detail: "Vendas dos últimos 12 meses e as novas",
    },
    {
      label: "Voltaram a comprar",
      icon: RepeatIcon,
      value: formatNumber(overview.returning),
      badge: overview.customers > 0 ? rate + "% dos clientes" : null,
      headline: "Compraram 2 vezes ou mais",
      detail: "Quem volta é o cliente mais valioso",
    },
    {
      label: "Total em compras",
      icon: WalletIcon,
      value: formatMoney(overview.totalSpent),
      headline: "Soma das compras pagas",
      detail: overview.customers > 0 ? "Média de " + formatMoney(average) + " por cliente" : "Sem compras ainda",
    },
    {
      label: "Novos em 30 dias",
      icon: SparklesIcon,
      value: formatNumber(overview.new30d),
      headline: "Primeira compra no último mês",
      detail: "Clientes que acabaram de conhecer a loja",
    },
  ]

  const filterCounts: Record<CustomerFilter, number> = {
    todos: overview.customers,
    voltaram: overview.returning,
    uma: Math.max(0, overview.customers - overview.returning),
    novos: overview.new30d,
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Quem comprou nas suas lojas do Mercado Livre: quanto comprou, quando e quem voltou a comprar."
        actions={
          accounts.length > 1 ? <AccountSelect accounts={accounts} value={state.account} allowAll resetParams={["pagina"]} /> : null
        }
      />

      <ImportStatus importing={sync.importing} ordersImported={sync.ordersImported} failed={sync.failed} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-linear-to-t from-primary/[0.04] to-card">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <kpi.icon className="size-4" />
                {kpi.label}
              </CardDescription>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CardTitle className="text-xl font-semibold whitespace-nowrap tabular-nums sm:text-3xl">{kpi.value}</CardTitle>
                {kpi.badge ? (
                  <Badge variant="outline" className="hidden border-primary/30 text-brand-teal-ink sm:inline-flex">
                    {kpi.badge}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardFooter className="mt-auto hidden flex-col items-start gap-1 border-t-0 bg-transparent pt-0 text-sm sm:flex">
              <p className="font-medium">{kpi.headline}</p>
              <p className="text-muted-foreground">{kpi.detail}</p>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <QuestionSearch
              action="/clientes"
              name="q"
              value={state.search}
              placeholder="Buscar por nome ou apelido"
              hidden={Object.fromEntries(
                Object.entries({
                  conta: state.account ?? "",
                  filtro: state.filter === "todos" ? "" : state.filter,
                  ordem: state.order === "recentes" ? "" : state.order,
                }).filter(([, value]) => value)
              )}
              clearHref={href({ search: "" })}
            />
            <OrderSelect
              value={state.order}
              options={(Object.keys(CUSTOMER_ORDERS) as CustomerOrder[]).map((order) => ({
                value: order,
                label: CUSTOMER_ORDERS[order].label,
                hint: CUSTOMER_ORDERS[order].hint,
                href: href({ order }),
              }))}
            />
          </div>
          <nav aria-label="Filtrar clientes" className="flex flex-wrap gap-1.5">
            {(Object.keys(CUSTOMER_FILTERS) as CustomerFilter[]).map((filter) => {
              const active = filter === state.filter
              return (
                <Link
                  key={filter}
                  href={href({ filter })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                    active && "ring-1 ring-foreground/15"
                  )}
                >
                  {CUSTOMER_FILTERS[filter].label}
                  {state.search ? null : (
                    <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(filterCounts[filter])}</span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {list.rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">{sync.importing && !filtered ? <Spinner /> : <UsersIcon />}</EmptyMedia>
              <EmptyTitle>
                {filtered ? "Nenhum cliente encontrado" : sync.importing ? "Importando suas vendas" : "Nenhum cliente ainda"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered ? (
                  <>
                    Tente outra busca ou{" "}
                    <Link href={customersHref({ ...state, search: "", filter: "todos", page: 1 })} className="text-primary hover:underline">
                      veja todos os clientes
                    </Link>
                    .
                  </>
                ) : sync.importing ? (
                  "Os clientes aparecem aqui conforme as vendas dos últimos 12 meses chegam do Mercado Livre."
                ) : (
                  "Quando alguém comprar nos seus anúncios, o cliente aparece aqui com as compras e as conversas."
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Cliente</TableHead>
                <TableHead className="hidden w-44 md:table-cell">Cidade</TableHead>
                {showAccount ? <TableHead className="hidden w-36 xl:table-cell">Conta</TableHead> : null}
                <TableHead className="w-20 text-right sm:w-24">Compras</TableHead>
                <TableHead className="hidden w-32 text-right sm:table-cell">Total</TableHead>
                <TableHead className="hidden w-36 lg:table-cell">Última compra</TableHead>
                <TableHead className="hidden w-32 2xl:table-cell">Primeira compra</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((customer) => {
                const name = customerDisplayName(customer)
                const detailHref = "/clientes/" + customer.id
                return (
                  <TableRow key={customer.id} className="relative">
                    <TableCell className="pl-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="hidden sm:flex">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-brand-teal-ink">
                            {customerInitials(customer)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            href={detailHref}
                            className="block truncate font-medium after:absolute after:inset-0 hover:text-primary"
                            title={name}
                          >
                            {name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {customer.nickname && customer.nickname !== name ? "@" + customer.nickname : null}
                            <span className="md:hidden">
                              {customer.nickname && customer.nickname !== name && customerLocation(customer.city, customer.state)
                                ? " · "
                                : null}
                              {customerLocation(customer.city, customer.state)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                      {customerLocation(customer.city, customer.state) ?? "—"}
                    </TableCell>
                    {showAccount ? (
                      <TableCell className="hidden truncate text-muted-foreground xl:table-cell">
                        {accountById.get(customer.ml_account_id)?.nickname ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">
                      <span className="font-medium">{formatNumber(customer.purchases_count)}</span>
                      {customer.purchases_count >= 2 ? (
                        <span className="block text-xs text-brand-teal-ink">voltou</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(customer.total_spent, customer.currency_id)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {customer.last_order_at ? (
                        <span title={formatDate(customer.last_order_at)}>{timeAgo(customer.last_order_at)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground 2xl:table-cell">
                      {customer.first_order_at ? formatDate(customer.first_order_at, "short") : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">
                      <ChevronRightIcon className="ml-auto size-4" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {list.total > CUSTOMERS_PAGE_SIZE ? (
          <InboxListFooter
            from={from}
            to={to}
            total={list.total}
            prevHref={state.page > 1 ? customersHref({ ...state, page: state.page - 1 }) : null}
            nextHref={state.page < totalPages ? customersHref({ ...state, page: state.page + 1 }) : null}
          />
        ) : null}

        <CardContent className="flex items-start gap-2 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-px size-3.5 shrink-0" />
          <p>
            Dados do Mercado Livre. Atenda pelo Mercado Livre: o ML não permite contato fora da plataforma (e-mail e
            telefone dos compradores não são compartilhados).
          </p>
        </CardContent>
      </Card>
    </>
  )
}
