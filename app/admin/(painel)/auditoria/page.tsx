import { XIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { AuditFilters } from "@/components/admin/audit-filters"
import { AuditList } from "@/components/admin/audit-list"
import { ListFooter } from "@/components/admin/list-footer"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AUDIT_FILTERS } from "@/lib/admin/labels"
import { AUDIT_PAGE_SIZE, listAdminAudit } from "@/lib/dal/admin"

export const metadata: Metadata = { title: "Auditoria" }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const organizationId = z.string().uuid().safeParse(first(params.cliente)).success ? first(params.cliente) : null
  const prefix = AUDIT_FILTERS.some((filter) => filter.value === first(params.tipo)) ? first(params.tipo) : ""
  const pageNumber = Number.parseInt(first(params.pagina), 10)
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1
  const list = await listAdminAudit({ organizationId, prefix, page })

  const hrefFor = (target: number) => {
    const query = new URLSearchParams()
    if (organizationId) query.set("cliente", organizationId)
    if (prefix) query.set("tipo", prefix)
    if (target > 1) query.set("pagina", String(target))
    const text = query.toString()
    return text ? `/admin/auditoria?${text}` : "/admin/auditoria"
  }

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Tudo o que foi feito no painel do administrador: quem, quando, de onde e o que mudou. O histórico não pode ser alterado."
      />
      <div className="flex flex-wrap items-center gap-2">
        <AuditFilters value={prefix} />
        {organizationId ? (
          <Link href={prefix ? `/admin/auditoria?tipo=${prefix}` : "/admin/auditoria"} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <XIcon data-icon="inline-start" />
            Só deste cliente: limpar
          </Link>
        ) : null}
      </div>
      <Card>
        <CardContent>
          <AuditList rows={list.rows} showOrganization={!organizationId} />
        </CardContent>
      </Card>
      <ListFooter page={page} pageSize={AUDIT_PAGE_SIZE} total={list.total} noun="registro" hrefFor={hrefFor} />
    </>
  )
}
