import { NextResponse } from "next/server"

import { toCsv } from "@/lib/admin/csv"
import { ORG_STAGE, ORG_STATUS } from "@/lib/admin/labels"
import { parseOrgListParams } from "@/lib/admin/schemas"
import type { AdminOrgList } from "@/lib/admin/types"
import { adminRequestContext, requireAdmin } from "@/lib/dal/admin"
import { createClient } from "@/lib/supabase/server"
import { formatWhatsapp } from "@/lib/validation/forms"

export const dynamic = "force-dynamic"

const EXPORT_LIMIT = 5000

/** Exporta a lista de clientes (com os filtros da tela) em CSV. Fica registrado no histórico. */
export async function GET(request: Request) {
  await requireAdmin()

  const url = new URL(request.url)
  const params = parseOrgListParams(Object.fromEntries(url.searchParams.entries()))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_list_organizations", {
    p_search: params.search,
    p_status: params.status,
    p_plan: params.plan,
    p_sort: params.sort,
    p_limit: EXPORT_LIMIT,
    p_offset: 0,
  })
  if (error) return new NextResponse("Erro ao exportar.", { status: 500 })
  const list = data as unknown as AdminOrgList

  await supabase.rpc("admin_log_event", {
    p_action: "admin.export",
    p_target_type: "organization",
    p_target_id: "lista",
    // Exportação não é de uma loja só (nulo é aceito pela função; os tipos gerados não sabem disso).
    p_organization_id: null as unknown as string,
    p_summary: `Exportou ${list.rows.length} cliente(s) em CSV`,
    p_details: { filters: params, rows: list.rows.length },
    p_context: await adminRequestContext(),
  })

  const csv = toCsv(
    [
      "Loja", "Situação", "Etapa", "Plano", "Mensalidade (R$)", "Dono", "E-mail", "WhatsApp", "Documento", "Nome/Razão social",
      "Contas ML ativas", "Contas ML", "IA ligada", "Pós-venda ligado", "Perguntas 30d", "Respostas da IA 30d",
      "Custo IA 30d (US$)", "Custo IA no mês (US$)", "Último acesso", "Cadastro", "Fim do teste", "ID",
    ],
    list.rows.map((row) => [
      row.name,
      ORG_STATUS[row.status]?.label ?? row.status,
      ORG_STAGE[row.stage]?.label ?? row.stage,
      row.plan ?? "",
      row.monthly_price,
      row.owner_name,
      row.owner_email,
      formatWhatsapp(row.owner_whatsapp),
      row.document ? `${row.document_type?.toUpperCase()} ${row.document}` : "",
      row.legal_name,
      row.ml_active,
      row.ml_total,
      row.auto_reply_on,
      row.after_sale_on,
      row.questions_30d,
      row.ai_answers_30d,
      Number(row.ai_cost_30d_usd),
      Number(row.ai_cost_month_usd),
      row.last_seen_at,
      row.created_at,
      row.trial_ends_at,
      row.organization_id,
    ])
  )

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="maanu-clientes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
