import Link from "next/link"

import { formatBrl } from "@/lib/admin/format"
import { AI_KEY_STATUS, AUDIT_FIELDS, SUBSCRIPTION_STATUSES, auditActionLabel } from "@/lib/admin/labels"
import { BILLING_CYCLE_LABELS, planName } from "@/lib/plans/plans"
import { formatWhatsapp } from "@/lib/validation/forms"
import type { AdminAuditRow } from "@/lib/admin/types"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/

/** Valor de um campo no formato da tela (plano pelo nome, situação em português, dinheiro em R$...). */
function show(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "—"
  if (key === "plan" && typeof value === "string") return planName(value) ?? value
  if (key === "billing_cycle" && typeof value === "string") {
    return BILLING_CYCLE_LABELS[value as keyof typeof BILLING_CYCLE_LABELS] ?? value
  }
  if (key === "subscription_status" && typeof value === "string") {
    return SUBSCRIPTION_STATUSES[value as keyof typeof SUBSCRIPTION_STATUSES] ?? value
  }
  if (key === "status" && typeof value === "string" && value in AI_KEY_STATUS) {
    return AI_KEY_STATUS[value as keyof typeof AI_KEY_STATUS].label
  }
  if ((key === "monthly_price" || key === "monthly_fixed_costs_brl" || key === "usd_brl_rate") && Number.isFinite(Number(value))) {
    return formatBrl(Number(value))
  }
  if (key === "whatsapp" && typeof value === "string") return formatWhatsapp(value)
  if (typeof value === "boolean") return value ? "sim" : "não"
  if (typeof value === "string" && ISO_DATE.test(value)) return formatDateTime(value)
  if (typeof value === "number") return new Intl.NumberFormat("pt-BR").format(value)
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}…` : value
  return JSON.stringify(value)
}

/** Antes → depois de cada campo alterado. */
function Changes({ details }: { details: AdminAuditRow["details"] }) {
  const after = details?.after
  if (!after || typeof after !== "object") return null
  const before = (details.before ?? {}) as Record<string, unknown>
  const keys = Object.keys(after)
  if (!keys.length) return null
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {keys.map((key) => (
        <li key={key}>
          <span className="font-medium text-foreground/80">{AUDIT_FIELDS[key] ?? key}:</span> {show(before[key], key)} →{" "}
          <span className="text-foreground">{show((after as Record<string, unknown>)[key], key)}</span>
        </li>
      ))}
    </ul>
  )
}

export function AuditList({ rows, showOrganization = false }: { rows: AdminAuditRow[]; showOrganization?: boolean }) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nada registrado ainda.</p>
  }
  return (
    <ol className="flex flex-col">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 border-b py-2.5 last:border-b-0">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              row.action.startsWith("platform.") ? "bg-destructive" : row.action.startsWith("admin.") ? "bg-slate-400" : "bg-primary"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{auditActionLabel(row.action)}</span>
              <time className="text-xs text-muted-foreground tabular-nums">{formatDateTime(row.created_at)}</time>
            </div>
            <p className="text-sm text-muted-foreground">
              {row.summary}
              {showOrganization && row.organization_id && row.organization_name ? (
                <>
                  {" · "}
                  <Link href={`/admin/clientes/${row.organization_id}`} className="text-brand-teal-ink hover:underline">
                    {row.organization_name}
                  </Link>
                </>
              ) : null}
            </p>
            <Changes details={row.details} />
            <p className="mt-0.5 text-xs text-muted-foreground/80">
              por {row.actor_email ?? "sistema"}
              {row.ip ? ` · IP ${row.ip}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
