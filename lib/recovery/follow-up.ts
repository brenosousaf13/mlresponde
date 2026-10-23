import { ownReviews, type ReturnReview } from "@/lib/recovery/returns"

/**
 * Acompanhamento depois do envio da revisão/contestação (puro, testado em tests/unit/recovery-ai.test.ts). Responde, na tela
 * da devolução e na lista: o ML ainda analisa? Decidiu a favor (ressarcido) ou contra? Qual é o próximo passo? Usa só o que a
 * maanu já lê do ML (revisões, recuperado) e o histórico do envio; não inventa prazo (o ML não informa o prazo da decisão
 * pela API) e não exige reescrever o sync.
 *
 * Alertas que já existem: return_recovered (ressarcido, 3 dias). Quando o ML NEGA não há alerta: a tela e a lista mostram
 * "ML negou" (e o caso vai para "Contestadas sem sucesso" no Raio-X).
 */

export type FollowUpStage = "analyzing" | "recovered" | "denied" | "confirmed_ok" | "closed"
export type FollowUpTone = "info" | "success" | "warning" | "neutral"
export type FollowUpStepKey = "sent" | "analysis" | "decision"
export type FollowUpStepState = "done" | "current" | "upcoming" | "failed"
export type FollowUpStep = { key: FollowUpStepKey; label: string; state: FollowUpStepState; at: string | null; detail: string | null }

export type FollowUp = {
  stage: FollowUpStage
  tone: FollowUpTone
  title: string
  description: string
  /** Quando a maanu enviou a revisão ao ML (ISO). */
  submittedAt: string | null
  daysSinceSubmit: number | null
  /** Passou de STALE_AFTER_DAYS sem decisão do ML: a tela sugere atualizar. */
  stale: boolean
  steps: FollowUpStep[]
  /** O que acontece depois (frases curtas, PT-BR). */
  nextSteps: string[]
  /** Texto curto para a lista de devoluções. */
  badge: string
  recoveredAmount: number | null
  currencyId: string | null
  /** A maanu ainda relê esta devolução sozinha. */
  watching: boolean
}

export type FollowUpSummary = Pick<FollowUp, "stage" | "tone" | "badge">

export type FollowUpInput = {
  phase: string
  review_kind: string | null
  review_submitted_at: string | null
  recovered_at: string | null
  recovered_amount: number | null
  currency_id: string | null
  reviews: unknown
  order_id: number | string | null
  /** Modo da revisão que a maanu enviou (recovery_actions.details.mode): "appeal" = contestação do armazém. */
  submittedMode?: "arrival" | "appeal" | null
}

export const STALE_AFTER_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000

function money(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "BRL" }).format(value)
  } catch {
    return "R$ " + value.toFixed(2)
  }
}

function day(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(value)
  )
}

function daysText(days: number): string {
  return days <= 0 ? "hoje" : days === 1 ? "há 1 dia" : "há " + days + " dias"
}

/** null = esta devolução não tem revisão enviada pela maanu (nada a acompanhar). */
export function returnFollowUp(input: FollowUpInput, now: Date = new Date()): FollowUp | null {
  const submitted = input.review_submitted_at && Number.isFinite(Date.parse(input.review_submitted_at)) ? input.review_submitted_at : null
  if (!submitted && !input.recovered_at) return null
  const reviews = ownReviews(
    Array.isArray(input.reviews) ? (input.reviews as ReturnReview[]) : [],
    input.order_id === null ? null : Number(input.order_id)
  )
  const days = submitted ? Math.max(0, Math.floor((now.getTime() - Date.parse(submitted)) / DAY_MS)) : null
  const word = input.submittedMode === "appeal" ? "contestação" : "revisão"
  const sent: FollowUpStep = {
    key: "sent",
    label: "Enviada ao Mercado Livre",
    state: "done",
    at: submitted,
    detail: submitted ? "A maanu enviou a " + word + " em " + day(submitted) + "." : null,
  }
  const base = {
    submittedAt: submitted,
    daysSinceSubmit: days,
    recoveredAmount: input.recovered_amount,
    currencyId: input.currency_id,
  }

  if (input.review_kind === "ok") {
    return {
      ...base,
      stage: "confirmed_ok",
      tone: "neutral",
      title: "Você confirmou que a devolução chegou certinho",
      description:
        "O Mercado Livre foi avisado" +
        (submitted ? " em " + day(submitted) : "") +
        ". O dinheiro segue com o comprador e não há mais nada a fazer nesta devolução.",
      stale: false,
      steps: [sent],
      nextSteps: [],
      badge: "Chegou certinho",
      watching: false,
    }
  }

  if (input.recovered_at) {
    const amount = input.recovered_amount ? money(input.recovered_amount, input.currency_id) : null
    return {
      ...base,
      stage: "recovered",
      tone: "success",
      title: "O Mercado Livre ressarciu você",
      description: (amount ? amount + " · " : "") + "A " + word + " enviada pela maanu deu certo.",
      stale: false,
      steps: [
        sent,
        { key: "analysis", label: "Análise do Mercado Livre", state: "done", at: null, detail: null },
        { key: "decision", label: "Decisão a seu favor", state: "done", at: input.recovered_at, detail: amount ? "Ressarcido: " + amount + "." : "Ressarcido." },
      ],
      nextSteps: ["Nada mais a fazer: o valor já entra em “Recuperado pela maanu”."],
      badge: amount ? "Ressarcido " + amount : "Ressarcido",
      watching: false,
    }
  }

  const deniedByMl = input.review_kind === "fail" && reviews.some((review) => review.seller_status === "success")
  if (deniedByMl) {
    return {
      ...base,
      stage: "denied",
      tone: "warning",
      title: "O Mercado Livre manteve a decisão",
      description:
        "O ML analisou a sua " + word + " e deu razão ao comprador: o dinheiro fica com ele. A decisão é do Mercado Livre.",
      stale: false,
      steps: [
        sent,
        { key: "analysis", label: "Análise do Mercado Livre", state: "done", at: null, detail: null },
        { key: "decision", label: "Decisão contra o pedido", state: "failed", at: null, detail: "O ML deu razão ao comprador." },
      ],
      nextSteps: [
        "O caso fica em “Contestadas sem sucesso” no Raio-X.",
        "A maanu não recontesta por aqui. Se você tiver provas novas, o canal é a Ajuda do Mercado Livre.",
      ],
      badge: "ML negou",
      watching: false,
    }
  }

  if (input.phase === "closed") {
    return {
      ...base,
      stage: "closed",
      tone: "neutral",
      title: "O Mercado Livre encerrou esta devolução",
      description: "Não vimos ressarcimento registrado para ela. Use “Atualizar” para ler o que o Mercado Livre registrou por último.",
      stale: false,
      steps: [
        sent,
        { key: "analysis", label: "Análise do Mercado Livre", state: "done", at: null, detail: null },
        { key: "decision", label: "Encerrada", state: "done", at: null, detail: "Sem ressarcimento registrado." },
      ],
      nextSteps: [],
      badge: "Encerrada",
      watching: false,
    }
  }

  const stale = days !== null && days >= STALE_AFTER_DAYS
  return {
    ...base,
    stage: "analyzing",
    tone: "info",
    title: "Sua " + word + " está em análise no Mercado Livre",
    description:
      (submitted ? "Enviada " + day(submitted) + " (" + daysText(days ?? 0) + "). " : "") +
      "O ML não informa o prazo da decisão. A maanu relê esta devolução a cada 30 a 60 minutos e atualiza esta tela.",
    stale,
    steps: [
      sent,
      { key: "analysis", label: "Análise do Mercado Livre", state: "current", at: null, detail: "O ML ainda não decidiu." },
      { key: "decision", label: "Decisão", state: "upcoming", at: null, detail: null },
    ],
    nextSteps: [
      ...(stale ? ["Já faz " + days + " dias sem decisão. Toque em “Atualizar” para ler o que o ML registrou."] : []),
      "Se o ML ressarcir: esta tela passa a mostrar “Ressarcido”, o valor entra em “Recuperado pela maanu” e avisamos por e-mail.",
      "Se o ML negar: esta tela mostra “O Mercado Livre manteve a decisão” (não enviamos alerta nesse caso).",
      "Você não precisa fazer nada agora.",
    ],
    badge: days !== null && days >= 1 ? "Em análise no ML " + daysText(days) : "Em análise no ML",
    watching: true,
  }
}

/** Resumo para a lista (rótulo curto, sem os passos). */
export function followUpSummary(input: FollowUpInput, now: Date = new Date()): FollowUpSummary | null {
  const followUp = returnFollowUp(input, now)
  return followUp ? { stage: followUp.stage, tone: followUp.tone, badge: followUp.badge } : null
}