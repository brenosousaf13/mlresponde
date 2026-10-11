import "server-only"

import { MlApiError } from "@/lib/mercadolivre/api"
import { mlRequest } from "@/lib/mercadolivre/client"
import { htmlToText, type ItemExtras, type MlItem, type MlProduct, type MlSizeChart } from "@/lib/mercadolivre/item"

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
  return mlRequest<MlItem & { seller_id?: number }>(
    accountId,
    `/items/${encodeURIComponent(itemId)}?include_attributes=all`
  )
}

/** Erro do ML que não adianta tentar de novo (o recurso não existe ou não pode ser lido). */
function isPermanentMlError(error: unknown) {
  return error instanceof MlApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

/**
 * Descrição do anúncio em texto simples. Sem descrição (404) ou sem permissão (outros 4xx): null.
 * Falha passageira (5xx, 429, rede) sobe o erro para a fila tentar de novo — a IA não responde sem ler a descrição.
 */
export async function fetchItemDescription(accountId: string, itemId: string): Promise<string | null> {
  try {
    const data = await mlRequest<{ plain_text?: string | null; text?: string | null }>(
      accountId,
      `/items/${encodeURIComponent(itemId)}/description`
    )
    const plain = data.plain_text?.trim()
    if (plain) return plain
    const html = data.text?.trim()
    return (html && htmlToText(html)) || null
  } catch (error) {
    if (isPermanentMlError(error)) {
      if ((error as MlApiError).status !== 404) console.warn(`[ml] descrição de ${itemId}:`, (error as Error).message)
      return null
    }
    throw error
  }
}

/** Informação complementar: qualquer falha vira null (a resposta não depende dela para sair). */
async function optional<T>(label: string, request: () => Promise<T>): Promise<T | null> {
  try {
    return await request()
  } catch (error) {
    if (!(error instanceof MlApiError && error.status === 404)) {
      console.warn(`[ml] ${label}:`, error instanceof Error ? error.message : error)
    }
    return null
  }
}

/** Produto de catálogo e tabela de medidas, quando o anúncio tiver. */
export async function fetchItemExtras(accountId: string, item: MlItem): Promise<ItemExtras> {
  const productId = item.catalog_product_id?.trim()
  const chartId = item.attributes?.find((attribute) => attribute.id === "SIZE_GRID_ID")?.value_name?.trim()
  const [product, sizeChart] = await Promise.all([
    productId && /^[A-Z]{3}\d+$/.test(productId)
      ? optional("produto de catálogo", () => mlRequest<MlProduct>(accountId, `/products/${productId}`))
      : null,
    chartId && /^[A-Za-z0-9_-]{1,40}$/.test(chartId)
      ? optional("tabela de medidas", () => mlRequest<MlSizeChart>(accountId, `/catalog/charts/${chartId}`))
      : null,
  ])
  return { product, sizeChart }
}

/** Tudo o que a IA lê de um anúncio: dados, descrição completa e complementos. */
export async function fetchItemContext(accountId: string, itemId: string, known?: MlItem & { seller_id?: number }) {
  const [item, description] = await Promise.all([
    known ? Promise.resolve(known) : fetchItem(accountId, itemId),
    fetchItemDescription(accountId, itemId),
  ])
  const extras = await fetchItemExtras(accountId, item)
  return { item, description, extras }
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
      .map((question) => ({ question: question.text, answer: question.answer!.text, buyerId: question.from?.id ?? null }))
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
