import { describe, expect, it } from "vitest"

import { dayKey, dayLabel, formatNumber, listTime, timeAgo } from "@/lib/format"
import {
  inboxHref,
  pageRange,
  parseInboxOrder,
  parseItemFilter,
  parsePage,
  questionSummary,
  rankTopItems,
  type InboxState,
} from "@/lib/questions/presentation"

describe("datas da caixa de entrada (fuso de São Paulo)", () => {
  // 2026-10-11 10:00 em São Paulo (UTC-3)
  const now = new Date("2026-10-11T13:00:00Z")

  it("usa o dia de São Paulo, não o UTC", () => {
    expect(dayKey("2026-10-11T02:30:00Z")).toBe("2026-10-10") // 23:30 do dia 10 em SP
    expect(dayKey("2026-10-11T03:30:00Z")).toBe("2026-10-11")
  })

  it("rotula hoje, ontem e dias anteriores", () => {
    expect(dayLabel("2026-10-11T12:00:00Z", now)).toBe("Hoje")
    expect(dayLabel("2026-10-10T20:00:00Z", now)).toBe("Ontem")
    expect(dayLabel("2026-10-08T15:00:00Z", now)).toBe("Quinta-feira, 8 de outubro")
    expect(dayLabel("2025-10-08T15:00:00Z", now)).toBe("Quarta-feira, 8 de outubro de 2025")
  })

  it("vira o ano corretamente em 1º de janeiro", () => {
    expect(dayLabel("2026-12-31T15:00:00Z", new Date("2027-01-01T15:00:00Z"))).toBe("Ontem")
  })

  it("mostra tempo relativo hoje e a hora nos outros dias", () => {
    expect(listTime("2026-10-11T11:00:00Z", now)).toBe("há 2 horas")
    expect(listTime("2026-10-10T17:36:00Z", now)).toBe("14:36")
  })

  it("arredonda o tempo relativo antes de escolher a unidade", () => {
    expect(timeAgo("2026-10-11T12:00:20Z", now)).toBe("há 1 hora")
    expect(timeAgo("2026-10-11T12:30:00Z", now)).toBe("há 30 minutos")
    expect(timeAgo("2026-10-10T13:10:00Z", now)).toBe("ontem")
  })

  it("formata números no padrão brasileiro", () => {
    expect(formatNumber(1234)).toBe("1.234")
    expect(formatNumber(12)).toBe("12")
  })
})

describe("estado da caixa de entrada na URL", () => {
  const base: InboxState = {
    tab: "responder",
    account: null,
    item: null,
    search: "",
    order: "recentes",
    page: 1,
    question: null,
  }

  it("omite o que é padrão", () => {
    expect(inboxHref(base)).toBe("/perguntas")
  })

  it("inclui filtros, ordem, página e pergunta aberta", () => {
    expect(
      inboxHref({ ...base, tab: "todas", item: "MLB123456789", search: "aro 29", order: "antigas", page: 3, question: "abc" })
    ).toBe("/perguntas?aba=todas&anuncio=MLB123456789&busca=aro+29&ordem=antigas&pagina=3&q=abc")
  })

  it("aceita só códigos de anúncio válidos", () => {
    expect(parseItemFilter("mlb1234567890")).toBe("MLB1234567890")
    expect(parseItemFilter("MLB12")).toBeNull()
    expect(parseItemFilter("x' or 1=1")).toBeNull()
    expect(parseItemFilter(["MLB1234567890"])).toBeNull()
  })

  it("lê ordem e página com segurança", () => {
    expect(parseInboxOrder("antigas")).toBe("antigas")
    expect(parseInboxOrder("qualquer")).toBe("recentes")
    expect(parsePage("3")).toBe(3)
    expect(parsePage("0")).toBe(1)
    expect(parsePage("-2")).toBe(1)
    expect(parsePage("abc")).toBe(1)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage("999999999")).toBe(100_000)
  })

  it("calcula a faixa da página", () => {
    expect(pageRange(1, 50, 1234)).toEqual({ from: 1, to: 50, totalPages: 25 })
    expect(pageRange(25, 50, 1234)).toEqual({ from: 1201, to: 1234, totalPages: 25 })
    expect(pageRange(1, 50, 0)).toEqual({ from: 0, to: 0, totalPages: 1 })
  })
})

describe("questionSummary", () => {
  it("pergunta em aberto mostra o motivo", () => {
    expect(
      questionSummary({ status: "needs_review", answer_source: null, review_reason: "ai_escalated", answer_text: null })
    ).toEqual({ tone: "open", label: "A IA preferiu deixar para você", preview: null })
    expect(questionSummary({ status: "failed", answer_source: null, review_reason: null, answer_text: null }).label).toBe(
      "Para você responder"
    )
  })

  it("respondida mostra quem respondeu e a prévia da resposta em uma linha", () => {
    expect(
      questionSummary({ status: "answered", answer_source: "ai", review_reason: null, answer_text: "Olá!\n  Temos sim." })
    ).toEqual({ tone: "ai", label: "IA", preview: "Olá! Temos sim." })
    expect(
      questionSummary({ status: "answered_outside", answer_source: "external", review_reason: null, answer_text: "Sim" }).label
    ).toBe("No Mercado Livre")
  })
})

describe("rankTopItems", () => {
  it("agrupa por anúncio, conta as que esperam o vendedor e ordena", () => {
    const rows = [
      { item_id: "MLB1", item_title: "Bike", item_thumbnail: null, status: "answered" },
      { item_id: "MLB2", item_title: "Capacete", item_thumbnail: "x.jpg", status: "needs_review" },
      { item_id: "MLB1", item_title: "Bike", item_thumbnail: null, status: "needs_review" },
      { item_id: null, item_title: null, item_thumbnail: null, status: "answered" },
      { item_id: "MLB3", item_title: "Luva", item_thumbnail: null, status: "answered" },
    ]
    expect(rankTopItems(rows, 2)).toEqual([
      { itemId: "MLB1", title: "Bike", thumbnail: null, total: 2, open: 1 },
      { itemId: "MLB2", title: "Capacete", thumbnail: "x.jpg", total: 1, open: 1 },
    ])
  })
})
