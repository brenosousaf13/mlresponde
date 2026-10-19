import "server-only"

import { computeSlack, type ReputationReading } from "@/lib/reputation/metrics"
import { buildForecast } from "@/lib/reputation/claims"
import { colorValue } from "@/lib/reputation/shipments"
import type { ReputationColor } from "@/lib/reputation/thresholds"
import type { Database } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

// Leituras da tela Reputação (RLS: só a própria organização).

type SnapshotRow = Database["public"]["Tables"]["reputation_snapshots"]["Row"]

const DAY = 24 * 60 * 60 * 1000

/** Registro do termômetro → leitura (os números gravados já são os efetivos). */
export function snapshotReading(row: SnapshotRow): ReputationReading {
  return {
    levelId: row.level_id,
    color: row.color as ReputationColor,
    powerSellerStatus: row.power_seller_status,
    protected: row.protected,
    protectionEndDate: row.protection_end_date,
    realColor: (row.real_color as ReputationColor | null) ?? null,
    periodDays: row.period_days,
    salesCompleted: row.sales_completed,
    metrics: {
      claims: { value: row.claims_value, rate: Number(row.claims_rate) },
      cancellations: { value: row.cancellations_value, rate: Number(row.cancellations_rate) },
      delayed: { value: row.delayed_value, rate: Number(row.delayed_rate) },
    },
  }
}

export async function getReputationPage(organizationId: string, accountId: string, now: Date = new Date()) {
  const supabase = await createClient()
  const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString()
  const [snapshots, sync, alerts, shipments, claims, costs, settings] = await Promise.all([
    supabase
      .from("reputation_snapshots")
      .select("*")
      .eq("ml_account_id", accountId)
      .order("captured_at", { ascending: false })
      .limit(1),
    supabase
      .from("reputation_sync")
      .select("last_reputation_at, last_shipments_at, last_claims_at, claims_backfilled_at, last_error, last_error_at")
      .eq("ml_account_id", accountId)
      .maybeSingle(),
    supabase
      .from("reputation_alerts")
      .select("id, kind, severity, title, body, data, opened_at")
      .eq("ml_account_id", accountId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(50),
    supabase
      .from("reputation_shipments")
      .select("shipment_id, ml_order_id, pack_id, item_title, ordered_at, sla_expected_at, logistic_type, status, substatus")
      .eq("ml_account_id", accountId)
      .eq("stage", "waiting")
      .gte("ordered_at", monthAgo)
      .order("sla_expected_at", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("reputation_claims")
      .select("claim_id, sale_at, affects_reputation")
      .eq("ml_account_id", accountId)
      .eq("affects_reputation", "affected")
      .gte("sale_at", new Date(now.getTime() - 400 * DAY).toISOString())
      .limit(2000),
    supabase
      .from("reputation_shipments")
      .select("ordered_at, sender_discount, sender_cost")
      .eq("ml_account_id", accountId)
      .not("costs_checked_at", "is", null)
      .gte("ordered_at", monthAgo)
      .limit(5000),
    supabase.from("reputation_settings").select("email_alerts").eq("organization_id", organizationId).maybeSingle(),
  ])
  for (const result of [snapshots, sync, alerts, shipments, claims, costs, settings]) if (result.error) throw result.error

  const snapshot = snapshots.data?.[0] ?? null
  const reading = snapshot ? snapshotReading(snapshot) : null
  const alertRows = alerts.data ?? []
  return {
    snapshot,
    reading,
    slack: reading ? computeSlack(reading) : null,
    sync: sync.data,
    alerts: [...alertRows].sort((a, b) =>
      a.severity === b.severity ? Date.parse(b.opened_at) - Date.parse(a.opened_at) : a.severity === "urgent" ? -1 : 1
    ),
    shipments: shipments.data ?? [],
    forecast: buildForecast(
      (claims.data ?? []).map((claim) => ({ ...claim, claim_id: Number(claim.claim_id) })),
      reading?.periodDays ?? null,
      now
    ),
    colorValue: colorValue(
      (costs.data ?? []).map((row) => ({
        ordered_at: row.ordered_at,
        sender_discount: row.sender_discount === null ? null : Number(row.sender_discount),
        sender_cost: row.sender_cost === null ? null : Number(row.sender_cost),
      })),
      now
    ),
    emailAlerts: settings.data?.email_alerts ?? true,
  }
}

export type ReputationPageData = Awaited<ReturnType<typeof getReputationPage>>
