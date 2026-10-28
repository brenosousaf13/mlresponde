import { recoveryHref, returnHref } from "@/lib/recovery/presentation"
import {
  suggestActionByRules,
  suggestionLabel,
  type ReturnSuggestion,
  type SuggestedAction,
  type SuggestInput,
  type SuggestionConfidence,
} from "@/lib/recovery/suggest"
import type { ReviewMode } from "@/lib/recovery/returns"
import type { LeftBehindSummary } from "@/lib/recovery/left-behind"

/** Recomendação exibida; ressarcimento_total fica reservado para regras futuras. */
export type QueueRecommendation = "contestar" | "ressarcimento_parcial" | "ressarcimento_total" | "chegou_certinho"
export type QueueActionGroup = "recover" | "confirm_receipt"

/** Classificação determinística exibida na fila, sem chamar a IA. */
export type ReviewQueueClassification = {
  /** Recomendação curta para a ação do vendedor. */
  recommendation: QueueRecommendation
  /** Grupo operacional: recuperar dinheiro ou só confirmar recebimento. */
  actionGroup: QueueActionGroup
  /** Confiança da sugestão produzida pelas regras. */
  confidence: SuggestionConfidence
  /** Texto curto da ação recomendada. */
  suggestionLabel: string
  /** Uma frase curta com o motivo da recomendação. */
  reasonShort: string
  /** Valor envolvido quando o caso entra no grupo de recuperação. */
  recoverableAmount: number | null
  /** Só é true quando o ML aceita confirmar a chegada e o modo é arrival. */
  quickConfirmAvailable: boolean
}

/** Resumo dos dois grupos acionáveis da fila. */
export type RecoveryQueueGroups = {
  /** Casos em que vale contestar ou pedir algum ressarcimento. */
  recover: {
    /** Quantidade de casos para recuperar. */
    count: number
    /** Soma dos valores envolvidos nos casos para recuperar. */
    amount: number
    /** Prazo mais próximo do grupo recover. */
    nextDeadlineAt: string | null
    /** Indica se o prazo mais próximo é estimado. */
    nextDeadlineEstimated: boolean
  }
  /** Casos cuja recomendação é confirmar que chegou certinho. */
  confirmReceipt: {
    /** Quantidade de casos só para confirmação. */
    count: number
    /** Prazo mais próximo do grupo de confirmação. */
    nextDeadlineAt: string | null
    /** Indica se o prazo mais próximo é estimado. */
    nextDeadlineEstimated: boolean
  }
}

export type ClassifyQueueItemInput = {
  /** Modo calculado pelo motor do Recuperador. */
  mode: ReviewMode
  /** Valor da venda. */
  amount: number | null
  /** O ML aceita o botão "chegou certinho" neste momento. */
  canReviewOk: boolean
  /** Sugestão já calculada pelas regras; útil para testes e para o DAL. */
  suggestion?: Pick<ReturnSuggestion, "action" | "reason" | "confidence">
  /** Entrada para calcular a sugestão sem IA, quando a sugestão ainda não foi montada. */
  suggestionInput?: SuggestInput
}

const RECOMMENDATION_BY_ACTION: Record<SuggestedAction, QueueRecommendation> = {
  contest: "contestar",
  partial_refund: "ressarcimento_parcial",
  do_not_contest: "chegou_certinho",
}

/** Trunca numa fronteira de palavra, para não deixar a linha com palavras cortadas. */
export function shortQueueReason(reason: string, max = 120): string {
  const normalized = reason.replace(/\s+/g, " ").trim()
  if (normalized.length <= max) return normalized
  const clipped = normalized.slice(0, max + 1)
  const boundary = clipped.lastIndexOf(" ")
  return (boundary > 0 ? clipped.slice(0, boundary) : clipped.slice(0, max)).trimEnd() + "…"
}

/** Classifica uma linha apenas com as regras determinísticas; a listagem nunca chama a IA. */
export function classifyQueueItem(input: ClassifyQueueItemInput): ReviewQueueClassification {
  const suggestion = input.suggestion ?? (input.suggestionInput ? suggestActionByRules(input.suggestionInput) : null)
  const action = suggestion?.action ?? "do_not_contest"
  const recommendation = RECOMMENDATION_BY_ACTION[action]
  // Uma contestação do armazém nunca vira confirmação rápida, mesmo quando a regra recomenda deixar passar.
  const actionGroup: QueueActionGroup = input.mode === "appeal" || recommendation !== "chegou_certinho" ? "recover" : "confirm_receipt"
  const reason = suggestion?.reason ?? "Confira a devolução e escolha a ação no detalhe."
  const confidence = suggestion?.confidence ?? "low"
  return {
    recommendation,
    actionGroup,
    confidence,
    suggestionLabel: suggestionLabel(action, input.mode),
    reasonShort: shortQueueReason(reason),
    recoverableAmount: actionGroup === "recover" ? input.amount : null,
    quickConfirmAvailable: actionGroup === "confirm_receipt" && input.mode === "arrival" && input.canReviewOk,
  }
}

/** Resumo do que o vendedor pode revisar ou contestar agora. */
export type ReviewNowSummary = {
  /** Quantidade de devoluções acionáveis. */
  count: number
  /** Soma dos valores das devoluções acionáveis. */
  amount: number
  /** Moeda usada no resumo, quando todas as linhas têm a mesma moeda. */
  currencyId: string | null
  /** Prazo mais próximo entre as linhas acionáveis. */
  nextDeadlineAt: string | null
  /** Indica se o prazo mais próximo é uma estimativa. */
  nextDeadlineEstimated: boolean
}

/** Resumo das devoluções que a maanu ajudou a recuperar. */
export type RecoveredSummary = {
  /** Quantidade de devoluções recuperadas. */
  count: number
  /** Soma dos valores recuperados. */
  amount: number
}

/** Linha compacta da fila "Revise agora". */
export type ReviewQueueItem = {
  /** Identificador da linha da devolução. */
  id: string
  /** Identificador numérico da reclamação no Mercado Livre. */
  claimId: number
  /** Título do item devolvido. */
  title: string | null
  /** Valor da venda. */
  amount: number | null
  /** Moeda do valor. */
  currencyId: string | null
  /** Prazo para agir. */
  deadlineAt: string | null
  /** Indica se o prazo é uma estimativa. */
  deadlineEstimated: boolean
  /** Tipo de ação liberada. */
  mode: "arrival" | "appeal"
  /** Situação do dinheiro no Mercado Pago. */
  statusMoney: string | null
  /** Recomendação determinística para esta linha. */
  recommendation: QueueRecommendation
  /** Grupo da fila ao qual a linha pertence. */
  actionGroup: QueueActionGroup
  /** Confiança da recomendação. */
  confidence: SuggestionConfidence
  /** Rótulo curto da recomendação. */
  suggestionLabel: string
  /** Motivo curto da recomendação. */
  reasonShort: string
  /** Valor recuperável quando o grupo é recover. */
  recoverableAmount: number | null
  /** Confirmação rápida disponível para esta linha. */
  quickConfirmAvailable: boolean
  /** Link para a tela da devolução. */
  href: string
}

/** Contrato estável para a tela do Recuperador. */
export type RecoveryScreenData = {
  /** Resumo da fila de revisão. */
  reviewNow: ReviewNowSummary
  /** Resumo do dinheiro recuperado. */
  recovered: RecoveredSummary
  /** Resumo separado entre recuperar dinheiro e só confirmar recebimento. */
  groups: RecoveryQueueGroups
  /** Itens ordenados para revisão. */
  queue: ReviewQueueItem[]
  /** Informa se já houve um envio bem-sucedido pela maanu. */
  hasFirstSubmission: boolean
  /** Link para o Raio-X. */
  xrayHref: string
  /** Link para a lista de devoluções a revisar. */
  returnsHref: string
  /** Resumo do dinheiro que ficou para trás no Raio-X, quando carregado pelo DAL. */
  leftBehind?: LeftBehindSummary
}

export type ReviewQueueInput = {
  id: string
  claim_id: number
  item_title: string | null
  amount: number | null
  currency_id: string | null
  deadline_at: string | null
  deadline_estimated: boolean
  mode: ReviewMode
  status_money: string | null
  claim_created_at: string | null
  can_review_ok?: boolean
  classification?: ReviewQueueClassification
}

type QueueItemWithCreatedAt = ReviewQueueItem & { claimCreatedAt?: string | null; claim_created_at?: string | null }

/** Ordena primeiro recuperação, depois confirmação; dentro do grupo, prazo, valor e data de abertura. */
export function sortReviewQueue<T extends ReviewQueueItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const group = (a.actionGroup === "recover" ? 0 : 1) - (b.actionGroup === "recover" ? 0 : 1)
    if (group !== 0) return group
    const leftParsed = a.deadlineAt ? Date.parse(a.deadlineAt) : Number.NaN
    const rightParsed = b.deadlineAt ? Date.parse(b.deadlineAt) : Number.NaN
    const left = Number.isFinite(leftParsed) ? leftParsed : Number.POSITIVE_INFINITY
    const right = Number.isFinite(rightParsed) ? rightParsed : Number.POSITIVE_INFINITY
    if (left !== right) return left - right
    const amount = (b.amount ?? Number.NEGATIVE_INFINITY) - (a.amount ?? Number.NEGATIVE_INFINITY)
    if (amount !== 0) return amount
    const leftCreatedAt = (a as QueueItemWithCreatedAt).claimCreatedAt ?? (a as QueueItemWithCreatedAt).claim_created_at
    const rightCreatedAt = (b as QueueItemWithCreatedAt).claimCreatedAt ?? (b as QueueItemWithCreatedAt).claim_created_at
    const leftCreated = Date.parse(leftCreatedAt ?? "")
    const rightCreated = Date.parse(rightCreatedAt ?? "")
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) return rightCreated - leftCreated
    if (Number.isFinite(leftCreated) !== Number.isFinite(rightCreated)) return Number.isFinite(rightCreated) ? 1 : -1
    return 0
  })
}

function queueItem(row: ReviewQueueInput, accountParam: string | null | undefined): QueueItemWithCreatedAt {
  const classification = row.classification ?? classifyQueueItem({ mode: row.mode, amount: row.amount, canReviewOk: Boolean(row.can_review_ok) })
  return {
    id: row.id,
    claimId: row.claim_id,
    title: row.item_title,
    amount: row.amount,
    currencyId: row.currency_id,
    deadlineAt: row.deadline_at,
    deadlineEstimated: row.deadline_estimated,
    mode: row.mode,
    statusMoney: row.status_money,
    ...classification,
    href: returnHref(row.id, accountParam),
    claimCreatedAt: row.claim_created_at,
  }
}

function deadlineSummary(items: readonly ReviewQueueItem[]) {
  const next = items
    .filter((item) => item.deadlineAt && Number.isFinite(Date.parse(item.deadlineAt)))
    .sort((a, b) => Date.parse(a.deadlineAt as string) - Date.parse(b.deadlineAt as string))[0]
  return {
    nextDeadlineAt: next?.deadlineAt ?? null,
    nextDeadlineEstimated: next?.deadlineEstimated ?? false,
  }
}

/** Resume os grupos na mesma ordem em que a fila será apresentada. */
export function summarizeQueueGroups(items: readonly ReviewQueueItem[]): RecoveryQueueGroups {
  const recover = items.filter((item) => item.actionGroup === "recover")
  const confirmReceipt = items.filter((item) => item.actionGroup === "confirm_receipt")
  return {
    recover: {
      count: recover.length,
      amount: Math.round(recover.reduce((total, item) => total + (item.recoverableAmount ?? 0), 0) * 100) / 100,
      ...deadlineSummary(recover),
    },
    confirmReceipt: {
      count: confirmReceipt.length,
      ...deadlineSummary(confirmReceipt),
    },
  }
}

/** Monta o contrato a partir das linhas já lidas pelo DAL; útil para a tela e para testes unitários. */
export function buildRecoveryScreenData(input: {
  accountParam?: string | null
  reviewRows: readonly ReviewQueueInput[]
  reviewNow: { count: number; amount: number; nextDeadline: string | null; nextDeadlineEstimated: boolean }
  recovered: RecoveredSummary
  hasFirstSubmission: boolean
  leftBehind?: LeftBehindSummary
}): RecoveryScreenData {
  const accountParam = input.accountParam ?? null
  const queue = sortReviewQueue(input.reviewRows.map((row) => queueItem(row, accountParam))).map((item) => {
    const row = { ...item }
    delete (row as QueueItemWithCreatedAt).claimCreatedAt
    return row
  })
  const currencyIds = new Set(input.reviewRows.map((row) => row.currency_id).filter(Boolean))
  return {
    reviewNow: {
      count: input.reviewNow.count,
      amount: input.reviewNow.amount,
      currencyId: currencyIds.size === 1 ? [...currencyIds][0] ?? null : null,
      nextDeadlineAt: input.reviewNow.nextDeadline,
      nextDeadlineEstimated: input.reviewNow.nextDeadlineEstimated,
    },
    recovered: input.recovered,
    groups: summarizeQueueGroups(queue),
    queue,
    hasFirstSubmission: input.hasFirstSubmission,
    xrayHref: recoveryHref(accountParam, "raio-x"),
    returnsHref: recoveryHref(accountParam, "devolucoes", "recuperar"),
    leftBehind: input.leftBehind,
  }
}
