import "server-only"

import { MlApiError } from "@/lib/mercadolivre/api"
import { mlRequest } from "@/lib/mercadolivre/client"
import type { MlItem } from "@/lib/mercadolivre/item"

export type MlQuestionStatus =
  | "UNANSWERED"
  | "ANSWERED"
  | "CLOSED_UNANSWERED"
  | "UNDER_REVIEW"
  | "BANNED"
  | "DELETED"
  | "DISABLED"

export type MlQuestion = {
  id: number
  seller_id: number
  item_id: string
  text: string
  status: MlQuestionStatus
  date_created: string
  from?: { id?: number }
  answer?: { text: string; status?: string; date_created?: string } | null
}

export function fetchQuestion(accountId: string, mlQuestionId: number) {
  return mlRequest<MlQuestion>(accountId, `/questions/${mlQuestionId}?api_version=4`)
}

export function fetchItem(accountId: string, itemId: string) {
  return mlRequest<MlItem & { seller_id?: number }>(accountId, `/items/${encodeURIComponent(itemId)}`)
}

export async function fetchItemDescription(accountId: string, itemId: string): Promise<string | null> {
  try {
    const data = await mlRequest<{ plain_text?: string }>(accountId, `/items/${encodeURIComponent(itemId)}/description`)
    return data.plain_text?.trim() || null
  } catch (error) {
    if (error instanceof MlApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchItemAnsweredQuestions(accountId: string, itemId: string, limit = 10) {
  const params = new URLSearchParams({
    item: itemId,
    api_version: "4",
    status: "ANSWERED",
    limit: String(limit),
    sort_fields: "date_created",
    sort_types: "DESC",
  })
  try {
    const data = await mlRequest<{ questions?: MlQuestion[] }>(accountId, `/questions/search?${params}`)
    return (data.questions ?? [])
      .filter((question) => question.answer?.text)
      .map((question) => ({ question: question.text, answer: question.answer!.text }))
  } catch {
    return []
  }
}

export function postAnswer(accountId: string, mlQuestionId: number, text: string) {
  return mlRequest<unknown>(accountId, "/answers", {
    method: "POST",
    body: JSON.stringify({ question_id: mlQuestionId, text }),
  })
}

export function searchUnansweredQuestions(accountId: string, offset = 0, limit = 50) {
  const params = new URLSearchParams({
    status: "UNANSWERED",
    api_version: "4",
    limit: String(limit),
    offset: String(offset),
    sort_fields: "date_created",
    sort_types: "DESC",
  })
  return mlRequest<{ questions?: MlQuestion[]; total?: number }>(
    accountId,
    `/my/received_questions/search?${params}`
  )
}
