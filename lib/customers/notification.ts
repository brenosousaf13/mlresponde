/** Notificação do tópico "orders_v2" do Mercado Livre (puro, testado em tests/unit/customers.test.ts). */

export type OrderNotification = { mlUserId: number; orderId: number }

const ORDER_RESOURCE = /^\/?orders\/(\d{1,19})$/

/** Venda criada ou alterada de uma conta conectada ao nosso app. O resource é "/orders/{id}". */
export function parseOrderNotification(body: unknown, expectedApplicationId: string): OrderNotification | null {
  if (!body || typeof body !== "object") return null
  const data = body as Record<string, unknown>
  if (data.topic !== "orders_v2") return null
  if (String(data.application_id ?? "") !== expectedApplicationId) return null

  const mlUserId = Number(data.user_id)
  if (!Number.isSafeInteger(mlUserId) || mlUserId <= 0) return null
  const match = typeof data.resource === "string" ? ORDER_RESOURCE.exec(data.resource.trim()) : null
  const orderId = match ? Number(match[1]) : Number.NaN
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return null
  return { mlUserId, orderId }
}
