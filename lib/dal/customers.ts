import "server-only"

import {
  CUSTOMERS_PAGE_SIZE,
  CUSTOMER_ORDER_COLUMNS,
  customerSearchFilter,
  newCustomersSince,
  readCustomersOverview,
  type CustomerOrderRow,
  type CustomersState,
} from "@/lib/customers/presentation"
import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Leituras da aba Clientes. Tudo com a sessão do usuário (RLS: só a própria organização), menos o nome de quem
// escreveu as observações (o perfil de outro membro não é visível pelo RLS).

export type CustomerListRow = {
  id: string
  ml_account_id: string
  buyer_id: number
  nickname: string | null
  full_name: string | null
  city: string | null
  state: string | null
  first_order_at: string | null
  last_order_at: string | null
  purchases_count: number
  total_spent: number
  currency_id: string | null
}

const LIST_FIELDS =
  "id, ml_account_id, buyer_id, nickname, full_name, city, state, first_order_at, last_order_at, purchases_count, total_spent, currency_id"
const DETAIL_FIELDS =
  "id, ml_account_id, buyer_id, nickname, full_name, city, state, first_order_at, last_order_at, purchases_count, total_spent, currency_id, notes, notes_updated_by, notes_updated_at, ml_accounts(nickname, ml_user_id)"

export async function getCustomersOverview(organizationId: string, accountId: string | null) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("customers_overview", {
    p_organization_id: organizationId,
    ...(accountId ? { p_ml_account_id: accountId } : {}),
  })
  if (error) throw error
  return readCustomersOverview(data)
}

/** Uma página da lista (50 por vez) com o total para a paginação. */
export async function listCustomers(organizationId: string, state: CustomersState) {
  const supabase = await createClient()
  let query = supabase
    .from("ml_customers")
    .select(LIST_FIELDS, { count: "exact" })
    .eq("organization_id", organizationId)
    .gt("purchases_count", 0)
  if (state.account) query = query.eq("ml_account_id", state.account)
  if (state.filter === "voltaram") query = query.gte("purchases_count", 2)
  if (state.filter === "uma") query = query.eq("purchases_count", 1)
  if (state.filter === "novos") query = query.gte("first_order_at", newCustomersSince())
  const search = customerSearchFilter(state.search)
  if (search) query = query.or(search)

  const { column, ascending } = CUSTOMER_ORDER_COLUMNS[state.order]
  query = query.order(column, { ascending, nullsFirst: false })
  if (column !== "last_order_at") query = query.order("last_order_at", { ascending: false, nullsFirst: false })
  query = query.order("id").range((state.page - 1) * CUSTOMERS_PAGE_SIZE, state.page * CUSTOMERS_PAGE_SIZE - 1)

  const { data, error, count } = await query
  return { rows: (data ?? []) as CustomerListRow[], total: count ?? 0, error }
}

export async function getCustomerSyncRows(organizationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ml_customer_sync")
    .select("ml_account_id, status, orders_imported, last_error, import_finished_at")
    .eq("organization_id", organizationId)
  if (error) throw error
  return data
}

export type CustomerDetail = Awaited<ReturnType<typeof getCustomerDetail>>

/** Ficha do cliente: dados, compras, perguntas e (com o plano) conversas do pós-venda. null = não existe ou é de outra loja. */
export async function getCustomerDetail(organizationId: string, customerId: string, options: { afterSale: boolean }) {
  const supabase = await createClient()
  const { data: customer, error } = await supabase
    .from("ml_customers")
    .select(DETAIL_FIELDS)
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .maybeSingle()
  if (error) throw error
  if (!customer) return null

  const [ordersResult, questionsResult, conversationsResult, noteAuthor] = await Promise.all([
    supabase
      .from("ml_orders")
      .select("ml_order_id, pack_id, status, ordered_at, total_amount, currency_id, mediations_count, items")
      .eq("organization_id", organizationId)
      .eq("customer_id", customer.id)
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("ml_questions")
      .select("id, question_text, item_title, item_id, question_created_at, created_at, status, answer_source, fallback_reason")
      .eq("organization_id", organizationId)
      .eq("ml_account_id", customer.ml_account_id)
      .eq("buyer_id", customer.buyer_id)
      .order("question_created_at", { ascending: false, nullsFirst: false })
      .limit(20),
    options.afterSale
      ? supabase
          .from("ml_conversations")
          .select("id, pack_id, item_title, status, review_reason, last_answer_source, last_message_text, last_message_from, last_message_at, pending_count")
          .eq("organization_id", organizationId)
          .eq("ml_account_id", customer.ml_account_id)
          .eq("buyer_id", customer.buyer_id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    customer.notes_updated_by ? noteAuthorName(customer.notes_updated_by) : Promise.resolve(null),
  ])
  if (ordersResult.error) throw ordersResult.error
  if (questionsResult.error) throw questionsResult.error
  if (conversationsResult.error) throw conversationsResult.error

  return {
    customer,
    orders: ordersResult.data as CustomerOrderRow[],
    questions: questionsResult.data,
    conversations: conversationsResult.data ?? [],
    noteAuthor,
  }
}

async function noteAuthorName(userId: string): Promise<string | null> {
  const { data, error } = await createServiceClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()
  if (error) {
    console.error("[clientes] autor das observações:", error.message)
    return null
  }
  return data?.full_name?.trim() || null
}
