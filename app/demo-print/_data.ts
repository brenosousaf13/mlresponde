/**
 * Dados FICTÍCIOS da vitrine de demonstração (loja inventada "Casa Aurora Store"). Nada aqui vem de cliente real.
 * As fotos dos anúncios usam o endereço `demo-*.mlstatic.com`; o script de captura devolve ilustrações no lugar.
 */
import type { FindingRow, RecoveryOverview, ReturnListRow } from "@/lib/dal/recovery"

const HOUR = 60 * 60 * 1000

export const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
export const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString()

export const DEMO_ACCOUNT_ID = "demo-conta-casa-aurora"

/** Endereço de foto aceito pelo app (mlstatic) que o script de captura substitui por uma ilustração. */
export const thumb = (slug: string) => `https://http2.mlstatic.com/D_NQ_NP_demo-${slug}-F.webp`

export const PRODUCTS = {
  tenis: { id: "MLB4381920001", title: "Tênis Corrida Masculino Amortecimento Leve Preto", thumb: thumb("tenis") },
  jaqueta: { id: "MLB4381920002", title: "Jaqueta Jeans Feminina Oversized Lavagem Clara", thumb: thumb("jaqueta") },
  fone: { id: "MLB4381920003", title: "Fone Bluetooth Sem Fio com Cancelamento de Ruído", thumb: thumb("fone") },
  tacas: { id: "MLB4381920004", title: "Kit 4 Taças de Cristal para Vinho 380 ml", thumb: thumb("tacas") },
  mochila: { id: "MLB4381920005", title: "Mochila Executiva Notebook 15,6 Impermeável", thumb: thumb("mochila") },
  cafeteira: { id: "MLB4381920006", title: "Cafeteira Elétrica Programável 1,2 L Inox", thumb: thumb("cafeteira") },
} as const

function returnRow(partial: Partial<ReturnListRow> & Pick<ReturnListRow, "id" | "claim_id" | "item_title" | "amount">): ReturnListRow {
  return {
    phase: "needs_review",
    currency_id: "BRL",
    deadline_at: null,
    claim_created_at: ago(30),
    ml_closed_at: null,
    status_money: null,
    shipment_status: "delivered",
    destination: null,
    review_kind: null,
    review_submitted_at: null,
    recovered_at: null,
    recovered_amount: null,
    is_cart: false,
    mode: "arrival",
    ...partial,
  }
}

export const WAITING_ROWS: ReturnListRow[] = [
  returnRow({
    id: "r1",
    claim_id: 5430118820,
    item_title: PRODUCTS.tenis.title + " Tam. 42",
    amount: 289.9,
    deadline_at: inHours(52),
    mode: "appeal",
    status_money: "refunded",
    claim_created_at: ago(190),
  }),
  returnRow({
    id: "r2",
    claim_id: 5430227741,
    item_title: PRODUCTS.fone.title,
    amount: 349,
    deadline_at: inHours(20),
    mode: "arrival",
    status_money: "retained",
    claim_created_at: ago(70),
  }),
  returnRow({
    id: "r3",
    claim_id: 5430331905,
    item_title: PRODUCTS.jaqueta.title + " M",
    amount: 219.9,
    deadline_at: inHours(96),
    mode: "appeal",
    status_money: "refunded",
    claim_created_at: ago(260),
  }),
  returnRow({
    id: "r4",
    claim_id: 5430412266,
    item_title: PRODUCTS.cafeteira.title,
    amount: 189.9,
    deadline_at: inHours(142),
    mode: "arrival",
    status_money: "retained",
    claim_created_at: ago(36),
  }),
]

export const OVERVIEW: RecoveryOverview = {
  sync: { last_returns_at: ago(0.04), last_error: null, last_error_at: null },
  scan: { status: "done", returns_total: 74, returns_done: 74, completed_at: ago(310) },
  claimsReady: true,
  waiting: {
    count: WAITING_ROWS.length,
    amount: WAITING_ROWS.reduce((total, row) => total + (row.amount ?? 0), 0),
    withoutAmount: 0,
    appeals: WAITING_ROWS.filter((row) => row.mode === "appeal").length,
    nextDeadline: inHours(20),
    rows: WAITING_ROWS,
  },
  appealed: { count: 2, amount: 538.8 },
  lost: { count: 6, amount: 1286.5 },
  recovered: { count: 5, amount: 1247.3 },
  reimbursed: { count: 3, amount: 702.4 },
  counts: { revisar: WAITING_ROWS.length, andamento: 7, encerradas: 41 },
}

function finding(partial: Partial<FindingRow> & Pick<FindingRow, "id" | "outcome" | "amount"> & { evidence: Record<string, unknown> }): FindingRow {
  return {
    return_row_id: partial.id,
    kind: partial.outcome === "reimbursed" ? "return_reimbursed" : "return_unsaleable_unreimbursed",
    confidence: "medium",
    currency_id: "BRL",
    status: partial.outcome === "reimbursed" ? "resolved" : "open",
    detected_at: ago(48),
    ...partial,
  }
}

export const FINDINGS: FindingRow[] = [
  finding({
    id: "f1",
    outcome: "contestable",
    amount: 289.9,
    confidence: "high",
    evidence: {
      item_title: PRODUCTS.tenis.title + " Tam. 42",
      product_condition: "unsaleable",
      reason_id: "misused",
      product_destination: "discard",
      claim_id: 5430118820,
      buyer_reason: "Não gostei, mudei de ideia",
      deadline_at: inHours(52),
    },
  }),
  finding({
    id: "f2",
    outcome: "contestable",
    amount: 219.9,
    confidence: "high",
    evidence: {
      item_title: PRODUCTS.jaqueta.title + " M",
      product_condition: "unsaleable",
      reason_id: "damaged",
      product_destination: "discard",
      claim_id: 5430331905,
      buyer_reason: "O produto chegou como esperado",
      deadline_at: inHours(96),
    },
  }),
  finding({
    id: "f3",
    outcome: "contestable",
    amount: 129.9,
    confidence: "medium",
    evidence: {
      item_title: PRODUCTS.tacas.title,
      product_condition: "unsaleable",
      reason_id: "incomplete",
      product_destination: "discard",
      claim_id: 5429988013,
      buyer_reason: "Comprei por engano",
      deadline_at: inHours(150),
    },
  }),
  finding({
    id: "f4",
    outcome: "appealed",
    amount: 318.9,
    evidence: { item_title: PRODUCTS.mochila.title, claim_id: 5429320417 },
  }),
  finding({
    id: "f5",
    outcome: "appealed",
    amount: 219.9,
    evidence: { item_title: PRODUCTS.jaqueta.title + " G", claim_id: 5429110553 },
  }),
  finding({
    id: "f6",
    outcome: "expired",
    amount: 412,
    evidence: {
      item_title: PRODUCTS.fone.title + " (par)",
      product_condition: "unsaleable",
      reason_id: "damaged",
      product_destination: "discard",
      claim_id: 5421003177,
    },
  }),
  finding({ id: "f7", outcome: "reimbursed", amount: 249, evidence: { item_title: PRODUCTS.cafeteira.title } }),
  finding({ id: "f8", outcome: "reimbursed", amount: 289.9, evidence: { item_title: PRODUCTS.tenis.title + " Tam. 40" } }),
  finding({ id: "f9", outcome: "reimbursed", amount: 163.5, evidence: { item_title: PRODUCTS.tacas.title } }),
]