import { dayKey, formatDateTime, formatTime } from "@/lib/format"
import { colorRank, slackSentence, type ReputationSlack } from "@/lib/reputation/metrics"
import { shipmentRisk } from "@/lib/reputation/shipments"
import { COLOR_LABELS, METRIC_LABELS, type MetricKey, type ReputationColor } from "@/lib/reputation/thresholds"

/**
 * Alertas do Escudo de Reputação (puro, testado em tests/unit/reputation.test.ts): o que abrir, atualizar, reabrir e
 * resolver a cada rodada, e quais e-mails mandar. Uma chave por conta + evento (unique em reputation_alerts).
 */

export type AlertKind =
  | "shipment_late"
  | "shipment_at_risk"
  | "margin_low"
  | "color_dropped"
  | "color_recovered"
  | "claim_new"
  | "claim_due_soon"
  | "claim_exclusion"
  | "claim_excluded"

export type AlertSeverity = "urgent" | "info"

export const ALERT_SEVERITY: Record<AlertKind, AlertSeverity> = {
  shipment_late: "urgent",
  shipment_at_risk: "urgent",
  margin_low: "urgent",
  color_dropped: "urgent",
  color_recovered: "info",
  claim_new: "urgent",
  claim_due_soon: "urgent",
  claim_exclusion: "info",
  claim_excluded: "info",
}

export const REPUTATION_ALERT_KINDS: readonly AlertKind[] = ["margin_low", "color_dropped", "color_recovered"]
export const SHIPMENT_ALERT_KINDS: readonly AlertKind[] = ["shipment_late", "shipment_at_risk"]

export type AlertDraft = {
  kind: AlertKind
  key: string
  title: string
  body: string
  data: Record<string, string | number | boolean | null>
  expiresAt?: string | null
}

export type ExistingAlert = {
  id: string
  kind: string
  dedupe_key: string
  status: string
  opened_at: string
  resolved_at: string | null
  expires_at: string | null
  email_status: string | null
  data: unknown
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Alerta reaberto antes disso volta sem e-mail (evita e-mail repetido quando a situação vai e volta). */
export const REOPEN_EMAIL_AFTER_MS = 7 * DAY
/** "Cor voltou" some sozinho depois de 3 dias. */
export const RECOVERED_TTL_MS = 3 * DAY
/** No máximo 1 e-mail por conta e tipo a cada 30 minutos. */
export const EMAIL_INTERVAL_MS = 30 * 60 * 1000
/** Alerta esperando e-mail há mais de 6 horas não sai mais (ficou velho). */
export const EMAIL_MAX_AGE_MS = 6 * HOUR

function truncate(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value
}

// ---------------------------------------------------------------------------------------------- rascunhos

export function reputationAlerts(input: {
  previousColor: ReputationColor | null
  color: ReputationColor
  slack: ReputationSlack
  periodDays: number | null
  now?: Date
}): AlertDraft[] {
  const now = input.now ?? new Date()
  const drafts: AlertDraft[] = []
  const period = input.periodDays ? " (medida pelos últimos " + input.periodDays + " dias)" : ""

  if (!input.slack.gray && input.slack.band) {
    for (const metric of input.slack.metrics) {
      if (metric.slack === null || metric.slack > 1) continue
      const labels = METRIC_LABELS[metric.key]
      drafts.push({
        kind: "margin_low",
        key: "margin_low:" + metric.key + ":" + input.slack.band,
        title: labels.title + " no limite da cor",
        body: (slackSentence(metric, labels) ?? "") + period,
        data: { metric: metric.key, slack: metric.slack, band: input.slack.band, approximate: metric.approximate },
      })
    }
  }

  const previous = input.previousColor
  if (previous && previous !== "none" && input.color !== previous) {
    const day = dayKey(now)
    if (colorRank(input.color) < colorRank(previous)) {
      drafts.push({
        kind: "color_dropped",
        key: "color_dropped:" + previous + ":" + input.color + ":" + day,
        title: "Sua reputação caiu para " + COLOR_LABELS[input.color],
        body:
          "A cor do termômetro passou de " +
          COLOR_LABELS[previous] +
          " para " +
          COLOR_LABELS[input.color] +
          ". Veja o que pesou e quando os problemas saem da conta.",
        data: { from: previous, to: input.color, fromRank: colorRank(previous) },
      })
    } else if (input.color !== "none") {
      drafts.push({
        kind: "color_recovered",
        key: "color_recovered:" + input.color + ":" + day,
        title: "Sua reputação voltou para " + COLOR_LABELS[input.color],
        body: "A cor do termômetro passou de " + COLOR_LABELS[previous] + " para " + COLOR_LABELS[input.color] + ".",
        data: { from: previous, to: input.color },
        expiresAt: new Date(now.getTime() + RECOVERED_TTL_MS).toISOString(),
      })
    }
  }
  return drafts
}

/** Um alerta "cor caiu" continua aberto até a cor voltar ao nível de antes. */
export function colorAlertStillValid(alert: ExistingAlert, color: ReputationColor): boolean {
  if (alert.kind !== "color_dropped") return false
  const fromRank = Number((alert.data as { fromRank?: unknown } | null)?.fromRank)
  return Number.isFinite(fromRank) && colorRank(color) < fromRank
}

export type WaitingShipment = {
  shipment_id: number
  sla_expected_at: string | null
  item_title: string | null
  ml_order_id: number | null
  pack_id: number | null
}

export function shipmentAlerts(shipments: readonly WaitingShipment[], now: Date = new Date()): AlertDraft[] {
  return shipments.flatMap((shipment): AlertDraft[] => {
    const risk = shipmentRisk(shipment.sla_expected_at, now)
    if (risk !== "late" && risk !== "at_risk") return []
    const item = truncate(shipment.item_title || "Venda " + (shipment.ml_order_id ?? shipment.shipment_id), 90)
    const deadline = shipment.sla_expected_at as string
    const data = {
      shipment_id: shipment.shipment_id,
      order_id: shipment.ml_order_id,
      pack_id: shipment.pack_id,
      expected_at: deadline,
    }
    if (risk === "late") {
      return [
        {
          kind: "shipment_late",
          key: "shipment_late:" + shipment.shipment_id,
          title: "Envio atrasado: " + item,
          body: "O prazo de despacho era " + formatDateTime(deadline) + ". Despache o quanto antes: envio atrasado conta na reputação.",
          data,
        },
      ]
    }
    return [
      {
        kind: "shipment_at_risk",
        key: "shipment_at_risk:" + shipment.shipment_id,
        title: "Despache até " + formatTime(deadline) + ": " + item,
        body: "O prazo de despacho vence em " + formatDateTime(deadline) + ". Depois disso conta como envio atrasado.",
        data,
      },
    ]
  })
}

// ---------------------------------------------------------------------------------------------- mudanças

export type AlertPlan = {
  inserts: AlertDraft[]
  /** Reabrir e mandar e-mail de novo (resolvido há mais de 7 dias). */
  reopenLoud: { id: string; draft: AlertDraft }[]
  /** Reabrir sem e-mail. */
  reopenSilent: { id: string; draft: AlertDraft }[]
  /** Continua aberto: atualiza texto e "visto por último". */
  refresh: { id: string; draft: AlertDraft }[]
  /** Situação acabou. skipEmail: ainda estava esperando o e-mail (não manda mais). */
  resolve: { id: string; skipEmail: boolean }[]
}

/**
 * Compara os alertas atuais (rascunhos) com os gravados de uma conta, só para os tipos avaliados nesta rodada (scope).
 * Alerta aberto que não veio de novo é resolvido, salvo se stillValid disser que continua (ex.: "cor caiu") e se não
 * tiver passado do expires_at.
 */
export function planAlertChanges(input: {
  existing: readonly ExistingAlert[]
  drafts: readonly AlertDraft[]
  scope: readonly AlertKind[]
  stillValid?: (alert: ExistingAlert) => boolean
  now?: Date
}): AlertPlan {
  const now = (input.now ?? new Date()).getTime()
  const byKey = new Map(input.existing.map((alert) => [alert.dedupe_key, alert]))
  const plan: AlertPlan = { inserts: [], reopenLoud: [], reopenSilent: [], refresh: [], resolve: [] }
  const current = new Set<string>()

  for (const draft of input.drafts) {
    if (current.has(draft.key)) continue
    current.add(draft.key)
    const found = byKey.get(draft.key)
    if (!found) plan.inserts.push(draft)
    else if (found.status === "open") plan.refresh.push({ id: found.id, draft })
    else if (found.resolved_at && now - Date.parse(found.resolved_at) > REOPEN_EMAIL_AFTER_MS) {
      plan.reopenLoud.push({ id: found.id, draft })
    } else plan.reopenSilent.push({ id: found.id, draft })
  }

  for (const alert of input.existing) {
    if (alert.status !== "open" || current.has(alert.dedupe_key)) continue
    if (!(input.scope as readonly string[]).includes(alert.kind)) continue
    const expired = alert.expires_at !== null && Date.parse(alert.expires_at) <= now
    if (!expired) {
      // Alerta de evento (com validade) vive até expirar; os outros, enquanto stillValid disser que continuam.
      if (alert.expires_at !== null) continue
      if (input.stillValid?.(alert)) continue
    }
    plan.resolve.push({ id: alert.id, skipEmail: alert.email_status === "pending" })
  }
  return plan
}

// ---------------------------------------------------------------------------------------------- e-mails

export type PendingEmailAlert = {
  id: string
  organization_id: string
  ml_account_id: string
  kind: string
  status: string
  created_at: string
  opened_at: string
}

export type EmailGroup = { organizationId: string; accountId: string; kind: AlertKind; ids: string[] }

/**
 * Quais alertas pendentes viram e-mail agora: 1 e-mail por conta e tipo, juntando os pendentes, se o último desse tipo
 * saiu há mais de 30 min. Resolvidos ou velhos (6 h) são descartados. lastSent: "conta:tipo" → data do último e-mail.
 */
export function planEmails(
  pending: readonly PendingEmailAlert[],
  lastSent: ReadonlyMap<string, string>,
  now: Date = new Date()
): { groups: EmailGroup[]; skip: string[] } {
  const skip: string[] = []
  const groups = new Map<string, EmailGroup>()
  for (const alert of pending) {
    const age = now.getTime() - Date.parse(alert.opened_at || alert.created_at)
    if (alert.status !== "open" || age > EMAIL_MAX_AGE_MS || ALERT_SEVERITY[alert.kind as AlertKind] !== "urgent") {
      skip.push(alert.id)
      continue
    }
    const groupKey = alert.ml_account_id + ":" + alert.kind
    const last = lastSent.get(groupKey)
    if (last && now.getTime() - Date.parse(last) < EMAIL_INTERVAL_MS) continue
    const group = groups.get(groupKey) ?? {
      organizationId: alert.organization_id,
      accountId: alert.ml_account_id,
      kind: alert.kind as AlertKind,
      ids: [],
    }
    group.ids.push(alert.id)
    groups.set(groupKey, group)
  }
  return { groups: [...groups.values()], skip }
}

export function metricLabel(key: string): string {
  return METRIC_LABELS[key as MetricKey]?.title ?? key
}

