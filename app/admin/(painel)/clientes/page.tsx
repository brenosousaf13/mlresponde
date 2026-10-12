import { BotIcon, DownloadIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { OrgStatusBadge, StageLabel } from "@/components/admin/badges"
import { ListFooter } from "@/components/admin/list-footer"
import { OrgFilters } from "@/components/admin/org-filters"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatBrl, formatInteger, formatShare, formatUsd } from "@/lib/admin/format"
import { parseOrgListParams } from "@/lib/admin/schemas"
import { ORG_PAGE_SIZE, listAdminOrganizations } from "@/lib/dal/admin"
import { formatDate, timeAgo } from "@/lib/format"
import { planName } from "@/lib/plans/plans"

export const metadata: Metadata = { title: "Clientes" }

function buildHref(params: ReturnType<typeof parseOrgListParams>, page: number, base = "/admin/clientes") {
  const query = new URLSearchParams()
  if (params.search) query.set("busca", params.search)
  if (params.status) query.set("situacao", params.status)
  if (params.plan) query.set("plano", params.plan)
  if (params.sort && params.sort !== "recent") query.set("ordem", params.sort)
  if (page > 1) query.set("pagina", String(page))
  const text = query.toString()
  return text ? `${base}?${text}` : base
}

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseOrgListParams(await searchParams)
  const list = await listAdminOrganizations(params)
  const filtered = Boolean(params.search || params.status || params.plan)

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Todas as lojas cadastradas: situação, etapa, uso, custo e último acesso."
        actions={
          <a
            href={buildHref({ ...params }, 1, "/admin/clientes/exportar")}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            download
          >
            <DownloadIcon data-icon="inline-start" />
            Exportar CSV
          </a>
        }
      />

      <OrgFilters search={params.search} status={params.status} plan={params.plan} sort={params.sort} />

      <Card className="py-0">
        {list.rows.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>{filtered ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}</EmptyTitle>
              <EmptyDescription>
                {filtered ? "Tente outra busca ou limpe os filtros." : "Os cadastros aparecem aqui assim que acontecerem."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Loja</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Contas ML</TableHead>
                <TableHead className="text-right">Perguntas (30d)</TableHead>
                <TableHead className="text-right">Custo IA (30d)</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="pr-4">Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((row) => (
                <TableRow key={row.organization_id} className="group">
                  <TableCell className="max-w-72 pl-4">
                    <Link href={`/admin/clientes/${row.organization_id}`} className="flex flex-col gap-0.5">
                      <span className="truncate font-medium group-hover:underline">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.owner_name || "Sem nome"} · {row.owner_email ?? "sem dono"}
                      </span>
                      {row.ml_nicknames ? (
                        <span className="truncate text-xs text-muted-foreground">ML: {row.ml_nicknames}</span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <OrgStatusBadge status={row.status} />
                      <StageLabel stage={row.stage} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span>{planName(row.plan) ?? <span className="text-muted-foreground">—</span>}</span>
                      {row.monthly_price !== null ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{formatBrl(row.monthly_price)}/mês</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex items-center justify-end gap-1.5">
                      {row.auto_reply_on ? <BotIcon className="size-3.5 text-primary" aria-label="IA ligada" /> : null}
                      {formatInteger(row.ml_active)}/{formatInteger(row.ml_total)}
                    </div>
                    {row.ml_invalid > 0 ? <span className="text-xs text-destructive">{row.ml_invalid} inválida</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatInteger(row.questions_30d)}</div>
                    {row.questions_30d > 0 ? (
                      <span className="text-xs text-muted-foreground">{formatShare(row.ai_answers_30d, row.questions_30d)} IA</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatUsd(row.ai_cost_30d_usd)}</div>
                    <span className="text-xs text-muted-foreground">{formatInteger(row.ai_calls_30d)} chamadas</span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {row.last_seen_at ? timeAgo(row.last_seen_at) : "nunca"}
                  </TableCell>
                  <TableCell className="pr-4 text-sm whitespace-nowrap text-muted-foreground">
                    {formatDate(row.created_at, "short")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ListFooter
        page={params.page}
        pageSize={ORG_PAGE_SIZE}
        total={list.total}
        noun="cliente"
        hrefFor={(page) => buildHref(params, page)}
      />
    </>
  )
}
