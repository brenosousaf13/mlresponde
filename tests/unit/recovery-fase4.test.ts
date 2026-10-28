import { describe, expect, it } from "vitest"

import { computeLeftBehind, type LeftBehindRow } from "@/lib/recovery/left-behind"
import { buildRecoveryFunnel, type RecoveryFunnelInput } from "@/lib/recovery/funnel"

const NOW = new Date("2026-10-28T12:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

function row(overrides: Partial<LeftBehindRow> = {}): LeftBehindRow {
  return {
    id: crypto.randomUUID(),
    claim_id: Math.floor(Math.random() * 100000),
    claim_created_at: "2026-10-20T12:00:00.000Z",
    amount: 100,
    currency_id: "BRL",
    status_money: "refunded",
    phase: "closed",
    mode: "arrival",
    destination: "seller_address",
    shipment_status: "delivered",
    deadline_at: "2026-10-25T12:00:00.000Z",
    deadline_estimated: false,
    review_submitted_at: null,
    review_kind: null,
    recovered_at: null,
    reviews: [],
    actions: [],
    ...overrides,
  }
}

describe("computeLeftBehind", () => {
  it("conta prazo do endereço vencido e marca o total como estimado quando o prazo veio da regra", () => {
    const result = computeLeftBehind([
      row({ id: "arrival-real", deadline_at: "2026-10-25T12:00:00.000Z" }),
      row({ id: "arrival-estimated", deadline_at: null, deadline_estimated: true, arrived_at: "2026-10-20T12:00:00.000Z" }),
    ], NOW)

    expect(result).toEqual({
      total: { count: 2, amount: 200, estimated: true },
      byReason: {
        prazo_endereco: { count: 2, amount: 200, estimated: true },
        contestacao_full_nao_feita: { count: 0, amount: 0, estimated: false },
        sem_condicao_venda: { count: 0, amount: 0, estimated: false },
      },
    })
  })

  it("conta contestação Full vencida com prazo estimado e mantém prazo real como não estimado", () => {
    const result = computeLeftBehind([
      row({ id: "appeal-real", mode: "appeal", deadline_at: "2026-10-01T12:00:00.000Z", deadline_estimated: false, reviews: [{ stage: "seller_review_pending", seller_status: "pending", updated_at: "2026-08-01T12:00:00.000Z" }] }),
      row({ id: "appeal-estimated", mode: "appeal", deadline_at: null, deadline_estimated: true, reviews: [{ stage: "seller_review_pending", seller_status: "pending", updated_at: "2026-08-01T12:00:00.000Z" }] }),
    ], NOW)

    expect(result.byReason.contestacao_full_nao_feita).toEqual({ count: 2, amount: 200, estimated: true })
  })

  it("mantém a regra de sem condição de venda e aplica a prioridade sem duplicar", () => {
    const result = computeLeftBehind([
      row({ id: "old-rule", finding_outcome: "expired", mode: null }),
      row({ id: "priority", finding_outcome: "expired", mode: "appeal", deadline_at: "2026-10-01T00:00:00.000Z" }),
      row({ id: "appeal", mode: "appeal", deadline_at: "2026-10-01T00:00:00.000Z", reviews: [{ stage: "seller_review_pending", seller_status: "pending", updated_at: "2026-08-01T00:00:00.000Z" }] }),
      row({ id: "arrival", mode: "arrival", deadline_at: "2026-10-01T00:00:00.000Z" }),
    ], NOW)

    expect(result.total).toEqual({ count: 4, amount: 400, estimated: false })
    expect(result.byReason.sem_condicao_venda).toEqual({ count: 2, amount: 200, estimated: false })
    expect(result.byReason.contestacao_full_nao_feita).toEqual({ count: 1, amount: 100, estimated: false })
    expect(result.byReason.prazo_endereco).toEqual({ count: 1, amount: 100, estimated: false })
  })

  it("exclui ressarcidos, recuperados, chegou certinho, dentro do prazo e fora dos 90 dias", () => {
    const result = computeLeftBehind([
      row({ id: "reimbursed", status_money: "reimbursed" }),
      row({ id: "recovered", recovered_at: NOW.toISOString() }),
      row({ id: "ok-kind", review_kind: "ok" }),
      row({ id: "ok-action", actions: [{ action: "return_review_ok", status: "success" }] }),
      row({ id: "future", deadline_at: "2026-11-01T12:00:00.000Z" }),
      row({ id: "old", claim_created_at: new Date(NOW.getTime() - 91 * DAY).toISOString() }),
    ], NOW)

    expect(result.total).toEqual({ count: 0, amount: 0, estimated: false })
  })
})

describe("buildRecoveryFunnel", () => {
  it("agrega por conta, decisões, envios e saúde do sync em uma única saída", () => {
    const input: RecoveryFunnelInput = {
      now: NOW,
      accounts: [
        { id: "account-1234", organization_id: "org-1", organization_name: "Loja A", status: "active", token_status: "valid", has_access: true },
        { id: "account-5678", organization_id: "org-2", organization_name: "Loja B", status: "active", token_status: "valid", has_access: true },
      ],
      returns: [
        { ...row({ id: "a-1", claim_id: 1, ml_account_id: "account-1234", phase: "needs_review", mode: "arrival", deadline_at: "2026-11-01T00:00:00.000Z" }),
          action_group: "recover", recommendation: "contest", can_review_ok: false },
        { ...row({ id: "a-2", claim_id: 2, ml_account_id: "account-1234", phase: "needs_review", mode: "arrival", deadline_at: "2026-11-01T00:00:00.000Z", recovered_at: "2026-10-27T00:00:00.000Z", recovered_amount: 90 }),
          action_group: "confirm_receipt", recommendation: "chegou_certinho", can_review_ok: true },
      ],
      actions: [
        { ml_account_id: "account-1234", return_row_id: "a-1", action: "return_review_fail", status: "success", performed_at: "2026-10-20T00:00:00.000Z" },
        { ml_account_id: "account-1234", return_row_id: "a-2", action: "return_review_ok", status: "failed", performed_at: "2026-10-20T00:00:00.000Z" },
      ],
      syncs: [
        { ml_account_id: "account-1234", last_returns_at: "2026-10-28T11:55:00.000Z", last_error: null, last_error_at: null },
        { ml_account_id: "account-5678", last_returns_at: "2026-10-28T10:00:00.000Z", last_error: null, last_error_at: null },
      ],
    }

    const [first, second] = buildRecoveryFunnel(input)
    expect(first).toMatchObject({
      account_id: "account-1234",
      account_label: "1234",
      organization_name: "Loja A",
      returns_read: 2,
      actionable_recover: 1,
      actionable_confirm: 1,
      sent_ok: 1,
      sent_failed: 1,
      decisions_in_favor: 1,
      decisions_against: 0,
      decisions_pending: 1,
      recovered_amount: 90,
      sync_status: "ok",
    })
    expect(second).toMatchObject({ account_id: "account-5678", returns_read: 0, sync_status: "parado" })
  })
})
