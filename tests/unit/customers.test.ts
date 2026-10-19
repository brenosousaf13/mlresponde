import { describe, expect, it } from "vitest"

import {
  IMPORT_DAYS,
  IMPORT_PAGE_SIZE,
  IMPORT_WINDOW_DAYS,
  MAX_WINDOW_ORDERS,
  ML_MAX_OFFSET,
  importRetryDelayMs,
  mlDateParam,
  nextImportCursor,
  pollFallbackSince,
  pollSince,
  resumeImport,
  startImport,
} from "@/lib/customers/import"
import { parseOrderNotification } from "@/lib/customers/notification"
import {
  MAX_ORDER_ITEMS,
  buyerName,
  isPurchase,
  mlId,
  shipmentLocation,
  stateCode,
  toIngestOrder,
  toIngestOrders,
  type MlSearchOrder,
} from "@/lib/customers/orders"
import {
  NOTE_MAX_LENGTH,
  customerDisplayName,
  customerInitials,
  customerLocation,
  customerSearchFilter,
  customersHref,
  groupPurchases,
  newCustomersSince,
  normalizeNote,
  orderStatusLabel,
  parseCustomerFilter,
  parseCustomerOrder,
  readCustomersOverview,
  returningRate,
  summarizeSync,
  type CustomerOrderRow,
} from "@/lib/customers/presentation"

const DAY = 24 * 60 * 60 * 1000

const order = (overrides: Partial<MlSearchOrder> = {}): MlSearchOrder => ({
  id: 2000012345678901,
  status: "paid",
  date_created: "2026-10-01T10:00:00.000-03:00",
  date_closed: "2026-10-01T10:01:00.000-03:00",
  last_updated: "2026-10-02T09:00:00.000-03:00",
  pack_id: null,
  total_amount: 129.9,
  paid_amount: 145.8,
  currency_id: "BRL",
  order_items: [
    {
      item: { id: "MLB123", title: "Calça Jeans", variation_attributes: [{ name: "Cor", value_name: "Azul" }, { name: "Tamanho", value_name: "40" }] },
      quantity: 2,
      unit_price: 64.95,
    },
  ],
  shipping: { id: 44001122334 },
  buyer: { id: 123456789, nickname: "COMPRADORA.TESTE", first_name: "Maria", last_name: "Silva" },
  seller: { id: 254752194 },
  mediations: [],
  ...overrides,
})

describe("toIngestOrder", () => {
  it("converte a venda do ML no formato do banco, só com os dados mínimos do comprador", () => {
    const row = toIngestOrder(order())
    expect(row).toEqual({
      ml_order_id: 2000012345678901,
      pack_id: null,
      buyer_id: 123456789,
      buyer_nickname: "COMPRADORA.TESTE",
      buyer_first_name: "Maria",
      buyer_last_name: "Silva",
      status: "paid",
      ordered_at: "2026-10-01T13:00:00.000Z",
      closed_at: "2026-10-01T13:01:00.000Z",
      ml_last_updated: "2026-10-02T12:00:00.000Z",
      total_amount: 129.9,
      paid_amount: 145.8,
      currency_id: "BRL",
      shipment_id: 44001122334,
      mediations_count: 0,
      items: [{ id: "MLB123", title: "Calça Jeans", variation: "Cor: Azul · Tamanho: 40", quantity: 2, unit_price: 64.95 }],
    })
    // Nada de e-mail, telefone, documento ou endereço no que vai para o banco.
    expect(JSON.stringify(row)).not.toMatch(/email|phone|doc|address/i)
  })

  it("descarta venda sem comprador (resposta 206 do ML), sem id ou sem situação", () => {
    expect(toIngestOrder(order({ buyer: null }))).toBeNull()
    expect(toIngestOrder(order({ id: "abc" }))).toBeNull()
    expect(toIngestOrder(order({ status: " " }))).toBeNull()
    expect(toIngestOrders([order(), order({ buyer: undefined }), order({ id: 2000012345678902 })])).toHaveLength(2)
  })

  it("lê o pack, ids em texto, reclamações e limita os itens", () => {
    const row = toIngestOrder(
      order({
        id: "2000012345678903",
        pack_id: "2000004567890123",
        mediations: [{ id: 1 }],
        order_items: Array.from({ length: 14 }, (_, index) => ({ item: { id: "MLB" + index, title: "Item " + index }, quantity: 1 })),
        shipping: null,
      })
    )
    expect(row?.ml_order_id).toBe(2000012345678903)
    expect(row?.pack_id).toBe(2000004567890123)
    expect(row?.mediations_count).toBe(1)
    expect(row?.items).toHaveLength(MAX_ORDER_ITEMS)
    expect(row?.shipment_id).toBeNull()
  })

  it("datas inválidas viram null e textos são limpos", () => {
    const row = toIngestOrder(order({ date_created: "ontem", buyer: { id: 1, nickname: "  APELIDO   COM  ESPAÇO " } }))
    expect(row?.ordered_at).toBeNull()
    expect(row?.buyer_nickname).toBe("APELIDO COM ESPAÇO")
    expect(row?.buyer_first_name).toBeNull()
  })

  it("nome do comprador: sobrenome repetido no nome é descartado", () => {
    expect(buyerName("Maria", "Silva")).toEqual({ first: "Maria", last: "Silva" })
    expect(buyerName("Maria Silva Souza", "Maria Silva Souza")).toEqual({ first: "Maria Silva Souza", last: null })
    expect(buyerName("Maria Silva Souza", "souza")).toEqual({ first: "Maria Silva Souza", last: null })
    expect(buyerName("  ", "Silva")).toEqual({ first: null, last: "Silva" })
    expect(buyerName(undefined, null)).toEqual({ first: null, last: null })
    expect(toIngestOrder(order({ buyer: { id: 5, first_name: "Ana Costa", last_name: "Ana Costa" } }))?.buyer_last_name).toBeNull()
  })

  it("situações que contam como compra", () => {
    expect(isPurchase("paid")).toBe(true)
    expect(isPurchase("partially_paid")).toBe(true)
    expect(isPurchase("partially_refunded")).toBe(true)
    expect(isPurchase("cancelled")).toBe(false)
    expect(isPurchase("payment_required")).toBe(false)
    expect(isPurchase(null)).toBe(false)
  })

  it("ids do ML", () => {
    expect(mlId(" 42 ")).toBe(42)
    expect(mlId(0)).toBeNull()
    expect(mlId(-3)).toBeNull()
    expect(mlId("1e5")).toBeNull()
    expect(mlId(undefined)).toBeNull()
  })

})

describe("cidade e UF do envio", () => {
  it("tira a UF do código do ML", () => {
    expect(stateCode("BR-MG")).toBe("MG")
    expect(stateCode("sp")).toBe("SP")
    expect(stateCode("Minas Gerais")).toBeNull()
    expect(stateCode(null)).toBeNull()
  })

  it("lê só cidade e UF do destino (formato novo e antigo)", () => {
    expect(
      shipmentLocation({
        destination: { shipping_address: { city: { name: "Belo Horizonte" }, state: { id: "BR-MG" } } },
      })
    ).toEqual({ city: "Belo Horizonte", state: "MG" })
    expect(shipmentLocation({ receiver_address: { city: { name: "Campinas" }, state: { id: "BR-SP" } } })).toEqual({
      city: "Campinas",
      state: "SP",
    })
    expect(shipmentLocation(null)).toEqual({ city: null, state: null })
    expect(shipmentLocation({ destination: { shipping_address: null } })).toEqual({ city: null, state: null })
  })
})

describe("importação dos últimos 12 meses", () => {
  const now = new Date("2026-10-19T15:00:00.000Z")

  it("começa na janela mais nova e vai até 365 dias atrás", () => {
    const cursor = startImport(now)
    expect(cursor.windowTo).toBe(now.toISOString())
    expect(Date.parse(cursor.windowTo) - Date.parse(cursor.windowFrom)).toBe(IMPORT_WINDOW_DAYS * DAY)
    expect(Date.parse(cursor.windowTo) - Date.parse(cursor.importSince)).toBe(IMPORT_DAYS * DAY)
    expect(cursor.offset).toBe(0)
  })

  it("página cheia avança o offset; página incompleta passa para a janela anterior", () => {
    const cursor = startImport(now)
    const full = nextImportCursor(cursor, { received: IMPORT_PAGE_SIZE, total: 120 })
    expect(full).toEqual({ done: false, cursor: { ...cursor, offset: 50 } })

    const last = nextImportCursor(full.cursor, { received: 20, total: 70 })
    expect(last.done).toBe(false)
    expect(last.cursor.offset).toBe(0)
    expect(last.cursor.windowTo).toBe(cursor.windowFrom)
    expect(Date.parse(last.cursor.windowTo) - Date.parse(last.cursor.windowFrom)).toBe(IMPORT_WINDOW_DAYS * DAY)
  })

  it("janela sem vendas também passa para a anterior", () => {
    const cursor = startImport(now)
    const next = nextImportCursor(cursor, { received: 0, total: 0 })
    expect(next.cursor.windowTo).toBe(cursor.windowFrom)
  })

  it("termina quando chega aos 12 meses (a última janela é menor)", () => {
    let cursor = startImport(now)
    let done = false
    let windows = 0
    while (!done && windows < 50) {
      const step = nextImportCursor(cursor, { received: 0, total: 0 })
      done = step.done
      cursor = step.cursor
      windows++
    }
    expect(done).toBe(true)
    expect(windows).toBe(Math.ceil(IMPORT_DAYS / IMPORT_WINDOW_DAYS))
    expect(cursor.windowFrom).toBe(cursor.importSince)
  })

  it("janela com vendas demais para o limite do ML é dividida ao meio (e a metade velha vira a próxima janela)", () => {
    const cursor = startImport(now)
    const split = nextImportCursor(cursor, { received: IMPORT_PAGE_SIZE, total: MAX_WINDOW_ORDERS + 1 })
    expect(split.done).toBe(false)
    expect(split.cursor.offset).toBe(0)
    expect(split.cursor.windowTo).toBe(cursor.windowTo)
    expect(Date.parse(split.cursor.windowTo) - Date.parse(split.cursor.windowFrom)).toBe((IMPORT_WINDOW_DAYS * DAY) / 2)

    // A janela menor tem vendas que cabem: pagina normalmente (não divide de novo no meio da paginação).
    const page = nextImportCursor({ ...split.cursor, offset: 50 }, { received: IMPORT_PAGE_SIZE, total: MAX_WINDOW_ORDERS + 1 })
    expect(page.cursor.offset).toBe(100)
    const after = nextImportCursor(split.cursor, { received: 10, total: 10 })
    expect(after.cursor.windowTo).toBe(split.cursor.windowFrom)
  })

  it("nunca passa do offset máximo do ML", () => {
    // offset 9.950 + limit 50 = 10.000 ainda vale; depois dele, a janela acaba.
    const cursor = { ...startImport(now), offset: ML_MAX_OFFSET - 2 * IMPORT_PAGE_SIZE }
    expect(nextImportCursor(cursor, { received: IMPORT_PAGE_SIZE, total: 50_000 }).cursor.offset).toBe(ML_MAX_OFFSET - IMPORT_PAGE_SIZE)
    const next = nextImportCursor({ ...cursor, offset: ML_MAX_OFFSET - IMPORT_PAGE_SIZE }, { received: IMPORT_PAGE_SIZE, total: 50_000 })
    expect(next.cursor.offset).toBe(0)
    expect(next.cursor.windowTo).toBe(cursor.windowFrom)
  })

  it("janela de 1 hora não divide mais", () => {
    const cursor = { ...startImport(now), windowFrom: new Date(now.getTime() - 60 * 60 * 1000).toISOString() }
    const next = nextImportCursor(cursor, { received: IMPORT_PAGE_SIZE, total: 20_000 })
    expect(next.cursor.windowFrom).toBe(cursor.windowFrom)
    expect(next.cursor.offset).toBe(IMPORT_PAGE_SIZE)
  })

  it("retoma do cursor gravado ou começa do zero", () => {
    const saved = { import_since: "2025-10-19T15:00:00.000Z", window_from: "2026-08-20T15:00:00.000Z", window_to: "2026-09-19T15:00:00.000Z", window_offset: 100 }
    expect(resumeImport(saved, now)).toEqual({
      started: false,
      cursor: { importSince: saved.import_since, windowFrom: saved.window_from, windowTo: saved.window_to, offset: 100 },
    })
    expect(resumeImport({ import_since: null, window_from: null, window_to: null, window_offset: 0 }, now)).toEqual({
      started: true,
      cursor: startImport(now),
    })
  })

  it("espera entre tentativas e datas dos filtros", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((attempt) => importRetryDelayMs(attempt) / 60000)).toEqual([1, 2, 4, 8, 16, 30, 30])
    expect(mlDateParam("2026-10-01T03:00:00.000Z")).toBe("2026-10-01T03:00:00.000-00:00")
  })

  it("conferência volta 5 minutos antes da última e tem plano B de 3 dias", () => {
    expect(pollSince("2026-10-19T14:50:00.000Z", null, now)).toBe("2026-10-19T14:45:00.000Z")
    expect(pollSince(null, "2026-10-19T10:00:00.000Z", now)).toBe("2026-10-19T09:55:00.000Z")
    expect(pollSince(null, null, now)).toBe(new Date(now.getTime() - 3 * DAY - 5 * 60000).toISOString())
    expect(pollFallbackSince(now)).toBe(new Date(now.getTime() - 3 * DAY).toISOString())
  })
})

describe("notificação orders_v2", () => {
  const app = "8693830632560554"
  const base = { topic: "orders_v2", resource: "/orders/2000012345678901", user_id: 254752194, application_id: 8693830632560554 }

  it("aceita venda do nosso app", () => {
    expect(parseOrderNotification(base, app)).toEqual({ mlUserId: 254752194, orderId: 2000012345678901 })
    expect(parseOrderNotification({ ...base, resource: "orders/77" }, app)).toEqual({ mlUserId: 254752194, orderId: 77 })
  })

  it("recusa outro tópico, outro app, recurso estranho ou conta inválida", () => {
    expect(parseOrderNotification({ ...base, topic: "orders" }, app)).toBeNull()
    expect(parseOrderNotification({ ...base, application_id: 1 }, app)).toBeNull()
    expect(parseOrderNotification({ ...base, resource: "/orders/abc" }, app)).toBeNull()
    expect(parseOrderNotification({ ...base, resource: "/orders/1/feedback" }, app)).toBeNull()
    expect(parseOrderNotification({ ...base, user_id: "x" }, app)).toBeNull()
    expect(parseOrderNotification(null, app)).toBeNull()
  })
})

describe("lista de clientes", () => {
  it("URL omite o que é padrão", () => {
    expect(customersHref({ account: null, search: "", filter: "todos", order: "recentes", page: 1 })).toBe("/clientes")
    expect(customersHref({ account: "c1", search: "maria", filter: "voltaram", order: "total", page: 3 })).toBe(
      "/clientes?conta=c1&q=maria&filtro=voltaram&ordem=total&pagina=3"
    )
  })

  it("filtros e ordens desconhecidos voltam ao padrão", () => {
    expect(parseCustomerFilter("novos")).toBe("novos")
    expect(parseCustomerFilter("hackers")).toBe("todos")
    expect(parseCustomerOrder("compras")).toBe("compras")
    expect(parseCustomerOrder(["total"])).toBe("recentes")
  })

  it("busca por apelido ou nome completo", () => {
    expect(customerSearchFilter("maria")).toBe("nickname.ilike.%maria%,full_name.ilike.%maria%")
    expect(customerSearchFilter("  ")).toBeNull()
  })

  it("novos = primeira compra nos últimos 30 dias", () => {
    expect(newCustomersSince(new Date("2026-10-31T00:00:00.000Z"))).toBe("2026-10-01T00:00:00.000Z")
  })

  it("nome, iniciais e cidade", () => {
    expect(customerDisplayName({ full_name: "Maria Silva", nickname: "MARIA123" })).toBe("Maria Silva")
    expect(customerDisplayName({ full_name: null, nickname: "MARIA123" })).toBe("MARIA123")
    expect(customerDisplayName({ full_name: null, nickname: null, buyer_id: 99 })).toBe("Comprador 99")
    expect(customerInitials({ full_name: "Maria da Silva" })).toBe("MS")
    expect(customerInitials({ nickname: "loja.top" })).toBe("LO")
    expect(customerLocation("Belo Horizonte", "MG")).toBe("Belo Horizonte/MG")
    expect(customerLocation(null, "MG")).toBe("MG")
    expect(customerLocation(null, null)).toBeNull()
  })

  it("números do topo", () => {
    expect(returningRate(40, 10)).toBe(25)
    expect(returningRate(0, 0)).toBe(0)
    expect(readCustomersOverview({ customers: 3, returning: 1, total_spent: "190.5", new_30d: 2 })).toEqual({
      customers: 3,
      returning: 1,
      totalSpent: 190.5,
      new30d: 2,
    })
    expect(readCustomersOverview(null)).toEqual({ customers: 0, returning: 0, totalSpent: 0, new30d: 0 })
  })

  it("importação: só contas que podem sincronizar contam como importando; falhas aparecem para tentar de novo", () => {
    const summary = summarizeSync(
      [
        { ml_account_id: "a", status: "running", orders_imported: 120, last_error: null },
        { ml_account_id: "b", status: "pending", orders_imported: 0, last_error: null },
        { ml_account_id: "c", status: "failed", orders_imported: 30, last_error: "HTTP 500" },
        { ml_account_id: "fora", status: "running", orders_imported: 999, last_error: null },
      ],
      [
        { id: "a", nickname: "LOJA A", usable: true },
        { id: "b", nickname: "LOJA B", usable: false },
        { id: "c", nickname: "LOJA C", usable: true },
      ]
    )
    expect(summary).toEqual({ importing: true, ordersImported: 120, failed: [{ accountId: "c", nickname: "LOJA C", message: "HTTP 500" }] })
  })
})

describe("compras da ficha do cliente", () => {
  const row = (overrides: Partial<CustomerOrderRow>): CustomerOrderRow => ({
    ml_order_id: 1,
    pack_id: null,
    status: "paid",
    ordered_at: "2026-10-01T10:00:00.000Z",
    total_amount: 10,
    currency_id: "BRL",
    mediations_count: 0,
    items: [{ id: "MLB1", title: "Calça", variation: "Cor: Azul", quantity: 1, unit_price: 10 }],
    ...overrides,
  })

  it("vendas do mesmo pack viram uma compra; ordem da mais recente para a mais antiga", () => {
    const purchases = groupPurchases([
      row({ ml_order_id: 11, pack_id: 900, total_amount: 100 }),
      row({ ml_order_id: 12, pack_id: 900, total_amount: 50, items: [{ title: "Blusa", quantity: 2 }] }),
      row({ ml_order_id: 13, status: "cancelled", ordered_at: "2026-10-05T10:00:00.000Z", total_amount: 30, mediations_count: 1 }),
    ])
    expect(purchases).toHaveLength(2)
    expect(purchases[0]).toMatchObject({ key: 13, status: "cancelled", valid: false, total: 30, hasClaim: true })
    expect(purchases[1]).toMatchObject({ key: 900, orderIds: [11, 12], status: "paid", valid: true, total: 150 })
    expect(purchases[1].items.map((item) => item.title)).toEqual(["Calça", "Blusa"])
  })

  it("pack com uma venda cancelada: conta só a parte paga e a situação é a válida", () => {
    const [purchase] = groupPurchases([
      row({ ml_order_id: 21, pack_id: 901, status: "cancelled", total_amount: 40 }),
      row({ ml_order_id: 22, pack_id: 901, status: "partially_refunded", total_amount: 60 }),
    ])
    expect(purchase).toMatchObject({ status: "partially_refunded", valid: true, total: 60 })
  })

  it("rótulos das situações", () => {
    expect(orderStatusLabel("paid")).toBe("Paga")
    expect(orderStatusLabel("partially_refunded")).toBe("Devolução parcial")
    expect(orderStatusLabel("cancelled")).toBe("Cancelada")
    expect(orderStatusLabel("algo_novo")).toBe("algo_novo")
  })
})

describe("observações", () => {
  it("aceita até o limite, tira espaços das pontas", () => {
    expect(normalizeNote("  prefere tamanho 40  ")).toEqual({ ok: true, note: "prefere tamanho 40" })
    expect(normalizeNote("")).toEqual({ ok: true, note: "" })
    expect(normalizeNote("a".repeat(NOTE_MAX_LENGTH))).toMatchObject({ ok: true })
  })

  it("recusa texto grande demais ou que não é texto", () => {
    expect(normalizeNote("a".repeat(NOTE_MAX_LENGTH + 1))).toMatchObject({ ok: false })
    expect(normalizeNote(42)).toMatchObject({ ok: false })
  })
})
