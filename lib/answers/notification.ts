export type QuestionNotification = {
  mlUserId: number
  mlQuestionId: number
}

export function parseQuestionNotification(
  body: unknown,
  expectedApplicationId: string
): QuestionNotification | null {
  if (!body || typeof body !== "object") return null
  const data = body as Record<string, unknown>
  if (data.topic !== "questions") return null
  if (String(data.application_id ?? "") !== expectedApplicationId) return null

  const mlUserId = Number(data.user_id)
  const match = typeof data.resource === "string" ? /^\/questions\/(\d+)$/.exec(data.resource) : null
  const mlQuestionId = match ? Number(match[1]) : NaN

  if (!Number.isSafeInteger(mlUserId) || mlUserId <= 0) return null
  if (!Number.isSafeInteger(mlQuestionId) || mlQuestionId <= 0) return null
  return { mlUserId, mlQuestionId }
}
