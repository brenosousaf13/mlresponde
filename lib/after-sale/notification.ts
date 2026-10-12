/** Notificação do tópico "messages" do Mercado Livre (puro, testado). */

export type MessageNotification = { mlUserId: number; messageId: string }

const MESSAGE_ID = /^[A-Za-z0-9_-]{6,120}$/

/**
 * Aceita só mensagens novas (actions "created"; notificações antigas sem actions também valem) do nosso app.
 * O resource é o id da mensagem (às vezes com o prefixo /messages/).
 */
export function parseMessageNotification(body: unknown, expectedApplicationId: string): MessageNotification | null {
  if (!body || typeof body !== "object") return null
  const data = body as Record<string, unknown>
  if (data.topic !== "messages") return null
  if (String(data.application_id ?? "") !== expectedApplicationId) return null
  if (Array.isArray(data.actions) && data.actions.length && !data.actions.includes("created")) return null

  const mlUserId = Number(data.user_id)
  if (!Number.isSafeInteger(mlUserId) || mlUserId <= 0) return null
  const resource = typeof data.resource === "string" ? data.resource.trim().replace(/^\/?messages\//, "") : ""
  if (!MESSAGE_ID.test(resource)) return null
  return { mlUserId, messageId: resource }
}
