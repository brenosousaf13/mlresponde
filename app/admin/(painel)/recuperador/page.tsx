import type { Metadata } from "next"
import Link from "next/link"

import { ToneBadge } from "@/components/admin/badges"
import { PageHeader } from "@/components/app/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAdminRecoveryFunnel } from "@/lib/dal/admin-recovery"
import { formatBrl, formatInteger } from "@/lib/admin/format"
import { formatDateTime } from "@/lib/format"

export const metadata: Metadata = { title: "Funil do Recuperador" }

function syncBadge(status: string) {
  if (status === "ok") return <ToneBadge tone="sage">Ok</ToneBadge>
  if (status === "parado") return <ToneBadge tone="amber">Parado</ToneBadge>
  return <ToneBadge tone="red">Sem acesso</ToneBadge>
}

export default async function AdminRecoveryPage() {
  const data = await getAdminRecoveryFunnel()
  return (
    <>
      <PageHeader
        title="Funil do Recuperador"
        description={`Devoluções lidas por conta do Mercado Livre nos últimos 90 dias. A partir de ${formatDateTime(data.from)}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Visão por conta</CardTitle>
          <CardDescription>Valores em reais. O status indica se a leitura automática está acompanhando a conta.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Conta / loja</TableHead>
                  <TableHead>Lidas</TableHead>
                  <TableHead>Acionáveis</TableHead>
                  <TableHead>Enviadas pela maanu</TableHead>
                  <TableHead>Decisões</TableHead>
                  <TableHead>Recuperado</TableHead>
                  <TableHead>Ficou para trás</TableHead>
                  <TableHead className="pr-6">Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.account_id}>
                    <TableCell className="min-w-52 pl-6">
                      <div className="font-mono text-xs text-muted-foreground">…{row.account_label}</div>
                      <Link href={`/admin/clientes/${row.organization_id}`} className="font-medium hover:underline">
                        {row.organization_name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatInteger(row.returns_read)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatInteger(row.actionable_recover)} recuperar · {formatInteger(row.actionable_confirm)} confirmar
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <span className="text-brand-teal-ink">{formatInteger(row.sent_ok)} ok</span> · <span className="text-destructive">{formatInteger(row.sent_failed)} falha</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      <div>{formatInteger(row.decisions_in_favor)} a favor · {formatInteger(row.decisions_against)} contra</div>
                      <div className="text-muted-foreground">{formatInteger(row.decisions_pending)} pendentes</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">{formatBrl(row.recovered_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <div className="font-medium">{formatBrl(row.left_behind.total.amount)}</div>
                      <div className="text-xs text-muted-foreground">{formatInteger(row.left_behind.total.count)} casos{row.left_behind.total.estimated ? " · prazo estimado" : ""}</div>
                    </TableCell>
                    <TableCell className="min-w-32 pr-6">
                      <div>{syncBadge(row.sync_status)}</div>
                      <div className="mt-1 text-xs text-muted-foreground" title={row.sync_message || undefined}>
                        {row.last_sync_at ? formatDateTime(row.last_sync_at) : "Sem leitura"}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data.rows.length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nenhuma conta do Mercado Livre conectada.</p> : null}
        </CardContent>
      </Card>
    </>
  )
}
