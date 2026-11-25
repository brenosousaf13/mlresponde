import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@/lib/supabase/database.types"
import { claimInputHash, parseClaimDetail, parseClaimMessages, parseExpectedResolutions, type MlClaimMessage } from "@/lib/reputation/claim-details"
import { toClaimRow, type MlClaim } from "@/lib/reputation/claims"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), claim: vi.fn(), detail: vi.fn(), messages: vi.fn(), expected: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/reputation/engine", async (original) => ({
  ...await original<typeof import("@/lib/reputation/engine")>(), applyAlerts: vi.fn(),
}))
vi.mock("@/lib/mercadolivre/reputation", async (original) => ({
  ...await original<typeof import("@/lib/mercadolivre/reputation")>(),
  fetchClaim: mocks.claim, fetchClaimDetail: mocks.detail, fetchClaimMessages: mocks.messages,
  fetchClaimExpectedResolutions: mocks.expected,
}))

const { CallBudget } = await import("@/lib/mercadolivre/reputation")
const { claimsHook, syncClaimDetails } = await import("@/lib/reputation/claims-engine")
const NOW = new Date("2026-11-04T12:00:00.000Z")
const OLD = "2026-11-04T10:00:00.000Z"
const account = { id: "conta", organization_id: "org", ml_user_id: 123, nickname: "Loja" }
type ClaimRow = Database["public"]["Tables"]["reputation_claims"]["Row"]

function database(mode: "single" | "batch", total = 1, messageCount = 1) {
  const raw: MlClaim = {
    id: 1, claim_version: 2, type: "mediations", status: "opened", stage: "claim", reason_id: null,
    resource: null, resource_id: null, fulfilled: false, date_created: OLD, last_updated: OLD,
    players: [{ role: "respondent", user_id: 123, available_actions: [{ action: "send_message_to_complainant" }] }],
    resolution: { reason: "other", benefited: [] },
  }
  const detail = { title: "Reclamação", description: "Descrição", problem: "Produto", due_date: null, action_responsible: null }
  const expected = [{ player_role: "complainant", expected_resolution: "refund", status: "pending" }]
  const messages: MlClaimMessage[] = Array.from({ length: messageCount }, (_, i) => ({
    hash: "hash-" + i, sender_role: "complainant", receiver_role: "respondent", message: "Mensagem " + i,
    date_created: OLD, stage: "claim", status: "read", message_moderation: { status: "accepted" },
    attachments: [{ filename: "foto.jpg", original_filename: "foto.jpg", size: 10, type: "image/jpeg" }],
  }))
  const parsed = parseClaimMessages(messages)
  const fresh = toClaimRow(raw, 123)!
  const claims: Record<string, unknown>[] = Array.from({ length: total }, (_, i) => ({
    ...fresh, id: "claim-" + (i + 1), claim_id: i + 1, organization_id: "org", ml_account_id: "conta",
    claim_version: "2", detail: parseClaimDetail(detail), reason_detail: null,
    expected_resolutions: parseExpectedResolutions(expected), order_summary: null, buyer_nickname: null, shipping: null,
    messages_count: messageCount, last_message_at: OLD, last_message_from: "complainant", details_synced_at: OLD,
    ai_status: "ready", ai_analyses: 1,
    ai_input_hash: claimInputHash({ status: fresh.status, stage: fresh.stage, mlUpdatedAt: fresh.ml_updated_at,
      actions: fresh.seller_actions, messageHashes: parsed.map((message) => message.hash) }),
  }))
  const stored: Record<string, unknown>[] = claims.flatMap((claim) => parsed.map((message) => ({
    ...message, organization_id: "org", ml_account_id: "conta", claim_row_id: claim.id,
  })))
  const db = supabaseFixture({ reputation_claims: claims, reputation_claim_messages: stored })
  mocks.service.mockReturnValue(db.client)
  mocks.claim.mockImplementation(async (_account, id) => ({ ...raw, id }))
  mocks.detail.mockResolvedValue(detail)
  mocks.messages.mockResolvedValue(messages)
  mocks.expected.mockResolvedValue(expected)
  const writes = (table: string) => db.requests.filter((r) => r.method !== "GET" && r.url.pathname.endsWith("/" + table))
  const run = () => mode === "batch" ? claimsHook(account, [], new CallBudget(100), NOW)
    : syncClaimDetails(account, claims[0] as unknown as ClaimRow, new CallBudget(100), NOW)
  return { ...db, raw, detail, expected, messages, stored, claims, run, writes }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
})
afterEach(() => vi.unstubAllGlobals())

describe.each(["single", "batch"] as const)("reclamações: escrita mínima (%s)", (mode) => {
  it("sem mudança, não grava mensagem e atualiza só details_synced_at", async () => {
    const db = database(mode)
    db.claims[0].ml_updated_at = "2026-11-04T10:00:00+00:00"
    db.claims[0].last_message_at = "2026-11-04T07:00:00-03:00"
    db.claims[0].detail = Object.fromEntries(Object.entries(db.detail).reverse())
    db.claims[0].resolution = { benefited: [], reason: "other" }
    db.claims[0].expected_resolutions = [Object.fromEntries(Object.entries(db.expected[0]).reverse())]
    db.stored[0].message_at = "2026-11-04T10:00:00+00:00"
    db.stored[0].attachments = [{ type: "image/jpeg", size: 10, original_filename: "foto.jpg", filename: "foto.jpg" }]
    await db.run()
    expect(mocks.messages).toHaveBeenCalledTimes(1)
    expect(db.writes("reputation_claim_messages")).toHaveLength(0)
    expect(db.writes("reputation_claims")).toHaveLength(1)
    expect(db.writes("reputation_claims")[0].body).toEqual({ details_synced_at: NOW.toISOString() })
  })

  it("mensagem nova: grava só o hash novo", async () => {
    const db = database(mode)
    db.messages.push({ ...db.messages[0], hash: "nova", message: "Outra mensagem" })
    await db.run()
    expect(db.writes("reputation_claim_messages")).toHaveLength(1)
    expect(db.writes("reputation_claim_messages")[0].body).toEqual([
      expect.objectContaining({ hash: "nova", claim_row_id: "claim-1", message: "Outra mensagem" }),
    ])
    expect(db.writes("reputation_claims")[0].body).toMatchObject({ messages_count: 2, ai_status: "pending" })
    expect(db.writes("reputation_claims")[0].body).toHaveProperty("ai_input_hash")
  })

  it.each([
    ["moderation_status", "rejected"], ["attachments", []], ["status", "pending"],
    ["stage", "dispute"], ["message", "Anterior"], ["message_at", null],
    ["sender_role", "mediator"], ["receiver_role", "mediator"],
  ])("mensagem existente: detecta mudança em %s", async (column, previous) => {
    const db = database(mode)
    db.stored[0][column as string] = previous
    await db.run()
    expect(db.writes("reputation_claim_messages")).toHaveLength(1)
    const rows = db.writes("reputation_claim_messages")[0].body as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe("hash-0")
    expect(rows[0][column as string]).not.toEqual(previous)
    // Metadados da mensagem não alteram a assinatura da entrada da IA.
    expect(db.writes("reputation_claims")[0].body).toEqual({ details_synced_at: NOW.toISOString() })
  })

  it("grava só os campos alterados da reclamação e conserva a análise em processamento", async () => {
    const db = database(mode)
    db.raw.status = "closed"
    db.raw.resolution = { benefited: ["respondent"], reason: "resolved" }
    db.claims[0].ai_status = "processing"
    await db.run()
    expect(db.writes("reputation_claims")[0].body).toEqual({
      status: "closed", resolution: db.raw.resolution, details_synced_at: NOW.toISOString(),
    })
  })

  it.each(["processing", "ready"])("preserva a regra da IA com status %s", async (status) => {
    const db = database(mode)
    db.claims[0].ai_status = status
    db.claims[0].ai_analyses = 8
    db.claims[0].ai_input_hash = "hash-anterior"
    await db.run()
    const update = db.writes("reputation_claims")[0].body
    if (status === "processing") expect(update).toEqual({ details_synced_at: NOW.toISOString() })
    else expect(update).toMatchObject({ ai_status: "skipped", ai_input_hash: expect.any(String) })
  })

  it("grava mudança no detalhe JSON, conservando os demais campos", async () => {
    const db = database(mode)
    db.detail.description = "Descrição atualizada"
    await db.run()
    expect(db.writes("reputation_claims")[0].body).toEqual({ detail: db.detail, details_synced_at: NOW.toISOString() })
  })

  it("pagina as mensagens: hash já gravado depois da linha 1.000 não é regravado", async () => {
    const db = database(mode, 1, 1001)
    await db.run()
    const reads = db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/reputation_claim_messages"))
    expect(reads.map((r) => r.url.searchParams.get("offset"))).toEqual(["0", "1000"])
    expect(reads[0].url.searchParams.get("select")).not.toContain("*")
    expect(db.writes("reputation_claim_messages")).toHaveLength(0)
  })
})

it("lote: lê mensagens das reclamações juntas e compara pela chave composta, antes dos updates", async () => {
  const db = database("batch", 2)
  db.stored[1].moderation_status = "rejected"
  await db.run()
  const reads = db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/reputation_claim_messages"))
  expect(reads).toHaveLength(1)
  expect(reads[0].url.searchParams.get("claim_row_id")).toBe("in.(claim-1,claim-2)")
  expect(db.writes("reputation_claim_messages")[0].body).toEqual([
    expect.objectContaining({ claim_row_id: "claim-2", hash: "hash-0", moderation_status: "accepted" }),
  ])
  const writes = db.requests.filter((r) => r.method !== "GET")
  expect(writes[0].url.pathname).toContain("reputation_claim_messages")
  expect(db.writes("reputation_claims").map((r) => r.body)).toEqual([
    { details_synced_at: NOW.toISOString() }, { details_synced_at: NOW.toISOString() },
  ])
})
