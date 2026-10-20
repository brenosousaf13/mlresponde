import { formatDateTime } from "@/lib/format"
import type { AlertDraft } from "@/lib/reputation/alerts"

/**
 * Alertas do Recuperador (puro, testado em tests/unit/recovery.test.ts). Usam a tabela reputation_alerts e o e-mail do
 * Escudo (os urgentes viram e-mail na rodada do cron da Reputação), com links para o Recuperador.
 *  - return_review_due (urgente): o ML liberou a revisão da devolução que chegou ("chegou a devolução") ou a contestação
 *    da revisão do armazém ("o ML devolveu o dinheiro ao comprador: dá para contestar").
 *  - return_review_closing (urgente): a revisão ou a contestação vence em menos de 24 horas.
 *  - return_recovered (informativo, 3 dias): o ML ressarciu uma revisão enviada pela maanu.
 */

const HOUR = 60 * 60 * 1000
export const RETURN_CLOSING_WINDOW_MS = 24 * HOUR
export const RETURN_RECOVERED_TTL_MS = 3 * 24 * HOUR

export type ReturnAlertInput = {
  id: string
  claim_id: number
  phase: string
  /** arrival = o pacote chegou ao vendedor; appeal = contestar a revisão do armazém (prazo estimado). */
  mode?: "arrival" | "appeal" | null
  deadline_at: string | null
  item_title: string | null
  recovered_at: string | null
  recovered_amount: number | null
  amount?: number | null
}

function truncate(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export function returnAlerts(rows: readonly ReturnAlertInput[], now: Date = new Date()): AlertDraft[] {
  const drafts: AlertDraft[] = []
  for (const row of rows) {
    const label = truncate(row.item_title || "Devolução " + row.claim_id, 90)
    const data = { return_row_id: row.id, claim_id: row.claim_id }
    if (row.phase === "needs_review") {
      const due = row.deadline_at ? Date.parse(row.deadline_at) : NaN
      const left = due - now.getTime()
      const appeal = row.mode === "appeal"
      const value = row.amount ? money(row.amount) : null
      if (Number.isFinite(due) && left > 0 && left <= RETURN_CLOSING_WINDOW_MS) {
        drafts.push({
          kind: "return_review_closing",
          key: "return_review_closing:" + row.claim_id + ":" + new Date(due).toISOString(),
          title: (appeal ? "Conteste até " : "Revise a devolução até ") + formatDateTime(new Date(due)) + ": " + label,
          body: appeal
            ? "O prazo para contestar a revisão do armazém do Mercado Livre está acabando" +
              (value ? " (" + value + " em jogo)" : "") +
              ". Depois dele o dinheiro fica com o comprador."
            : "Depois do prazo o Mercado Livre segue sem a sua revisão. Se chegou com problema, mande as fotos agora pela maanu.",
          data,
        })
      } else if (appeal) {
        drafts.push({
          kind: "return_review_due",
          key: "return_review_due:" + row.claim_id,
          title: "Dá para contestar" + (value ? " " + value : "") + ": " + label,
          body:
            "O armazém do Mercado Livre marcou o produto como sem condição de venda e devolveu o dinheiro ao comprador. Se o produto saiu em perfeito estado, conteste pela maanu" +
            (Number.isFinite(due) && left > 0 ? " até " + formatDateTime(new Date(due)) + " (prazo estimado)" : "") +
            ".",
          data,
        })
      } else {
        drafts.push({
          kind: "return_review_due",
          key: "return_review_due:" + row.claim_id,
          title: "Chegou a devolução: " + label,
          body:
            "Confira o produto e diga ao Mercado Livre se chegou certinho ou com problema" +
            (Number.isFinite(due) && left > 0 ? " até " + formatDateTime(new Date(due)) : "") +
            ". Leva 1 minuto pelo celular.",
          data,
        })
      }
    }
    const recovered = row.recovered_at ? Date.parse(row.recovered_at) : NaN
    if (Number.isFinite(recovered) && now.getTime() - recovered <= RETURN_RECOVERED_TTL_MS) {
      drafts.push({
        kind: "return_recovered",
        key: "return_recovered:" + row.claim_id,
        title: "O Mercado Livre ressarciu " + (row.recovered_amount ? money(row.recovered_amount) : "a devolução") + ": " + label,
        body: "A revisão que você enviou pela maanu deu certo. O valor entra no contador \"Recuperado pela maanu\".",
        data,
        expiresAt: new Date(recovered + RETURN_RECOVERED_TTL_MS).toISOString(),
      })
    }
  }
  return drafts
}
