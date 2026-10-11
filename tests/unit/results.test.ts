import { describe, expect, it } from "vitest"

import { formatCurrency, formatFactor, formatHours, formatWorkDays } from "@/lib/results/format"
import {
  classifyTopic,
  estimateSavings,
  fillDaily,
  hoursUntilOpen,
  isBusinessHour,
  parseOverview,
  parsePeriod,
  percentChange,
  periodRange,
  share,
  speedDistribution,
  speedFactor,
  summarizeHours,
  summarizeTopics,
} from "@/lib/results/metrics"

describe("período", () => {
  it("aceita só 7, 30 ou 90 dias (padrão 30)", () => {
    expect(parsePeriod("7")).toBe(7)
    expect(parsePeriod("90")).toBe(90)
    expect(parsePeriod("15")).toBe(30)
    expect(parsePeriod(undefined)).toBe(30)
  })

  it("começa à meia-noite de Brasília do primeiro dia, contando hoje", () => {
    // 11/10/2026 01:30 em Brasília = 04:30 UTC
    const now = new Date("2026-10-11T04:30:00Z")
    const range = periodRange(7, now)
    expect(range.startDay).toBe("2026-10-05")
    expect(range.from.toISOString()).toBe("2026-10-05T03:00:00.000Z")
    expect(range.to).toBe(now)
  })

  it("usa a data de Brasília mesmo quando em UTC já é o dia seguinte", () => {
    // 10/10/2026 22:00 em Brasília = 11/10 01:00 UTC
    const range = periodRange(1, new Date("2026-10-11T01:00:00Z"))
    expect(range.startDay).toBe("2026-10-10")
  })
})

describe("leitura do JSON da função SQL", () => {
  it("preenche o que falta com zero/nulo e converte nomes", () => {
    const overview = parseOverview({
      current: { total: 10, ai: "7", ai_median_seconds: 12.5, human_median_seconds: null },
      previous: {},
      daily: [{ day: "2026-10-10", total: 3, ai: 2, human: 1, open: 0 }],
      items: [{ item_id: "MLB1", title: "Bike", total: 4 }, { title: "sem id" }],
      causes: { ai_off: 1, no_info: 2 },
      lifetime_ai: 40,
    })
    expect(overview.current.ai).toBe(7)
    expect(overview.current.manual).toBe(0)
    expect(overview.current.aiMedianSeconds).toBe(12.5)
    expect(overview.current.humanMedianSeconds).toBeNull()
    expect(overview.previous.total).toBe(0)
    expect(overview.items).toHaveLength(1)
    expect(overview.items[0]).toMatchObject({ itemId: "MLB1", thumbnail: null, ai: 0 })
    expect(overview.causes).toEqual({ aiOff: 1, noInfo: 2, unsure: 0 })
    expect(overview.lifetimeAi).toBe(40)
    expect(parseOverview(null).current.total).toBe(0)
  })
})

describe("comparações", () => {
  it("calcula parte e variação", () => {
    expect(share(7, 10)).toBe(70)
    expect(share(1, 0)).toBe(0)
    expect(percentChange(15, 10)).toBe(50)
    expect(percentChange(5, 10)).toBe(-50)
    expect(percentChange(5, 0)).toBeNull()
  })

  it("diz quantas vezes a IA é mais rápida", () => {
    expect(speedFactor(10, 3600)).toBe(360)
    expect(speedFactor(12, 1800)).toBe(150)
    expect(speedFactor(20, 600)).toBe(30)
    expect(speedFactor(60, 300)).toBe(5)
    expect(speedFactor(100, 120)).toBeNull()
    expect(speedFactor(null, 300)).toBeNull()
    expect(speedFactor(0.4, 60)).toBe(60)
  })
})

describe("economia estimada", () => {
  it("multiplica respostas da IA pelos minutos e pelo custo da hora", () => {
    const savings = estimateSavings({ answers: 120, minutesPerAnswer: 3, hourlyCost: 20, days: 30 })
    expect(savings.hours).toBe(6)
    expect(savings.amount).toBe(120)
    expect(savings.workDays).toBe(0.75)
    expect(savings.monthlyAmount).toBe(120)
    expect(savings.yearlyAmount).toBe(1460)
  })

  it("projeta para 30 dias no ritmo do período", () => {
    const savings = estimateSavings({ answers: 70, minutesPerAnswer: 6, hourlyCost: 30, days: 7 })
    expect(savings.amount).toBe(210)
    expect(savings.monthlyAmount).toBe(900)
  })
})

describe("horário comercial", () => {
  it("segunda a sexta, das 8h às 18h", () => {
    expect(isBusinessHour(1, 8)).toBe(true)
    expect(isBusinessHour(5, 17)).toBe(true)
    expect(isBusinessHour(5, 18)).toBe(false)
    expect(isBusinessHour(6, 10)).toBe(false)
    expect(isBusinessHour(7, 10)).toBe(false)
    expect(isBusinessHour(3, 7)).toBe(false)
  })

  it("calcula a espera até o próximo expediente", () => {
    expect(hoursUntilOpen(2, 10.5)).toBe(0)
    expect(hoursUntilOpen(2, 3.5)).toBe(4.5)
    expect(hoursUntilOpen(2, 20.5)).toBe(11.5)
    expect(hoursUntilOpen(5, 19.5)).toBe(60.5)
    expect(hoursUntilOpen(6, 10.5)).toBe(45.5)
    expect(hoursUntilOpen(7, 23.5)).toBe(8.5)
  })

  it("resume o mapa de horários com a espera evitada pela IA", () => {
    const summary = summarizeHours([
      { dow: 2, hour: 10, total: 5, ai: 4 },
      { dow: 2, hour: 22, total: 3, ai: 2 },
      { dow: 6, hour: 9, total: 2, ai: 1 },
      { dow: 9, hour: 1, total: 99, ai: 99 },
    ])
    expect(summary.total).toBe(10)
    expect(summary.offHoursTotal).toBe(5)
    expect(summary.offHoursAi).toBe(3)
    expect(summary.offHoursShare).toBe(50)
    expect(summary.weekendShare).toBe(20)
    expect(summary.weekdayNightShare).toBe(30)
    // ter 22h30 → qua 8h = 9,5 h (x2) ; sáb 9h30 → seg 8h = 46,5 h (x1)
    expect(summary.waitAvoidedHours).toBe(9.5 * 2 + 46.5)
    expect(summary.matrix[1][10]).toBe(5)
    expect(summary.max).toBe(5)
    expect(summary.peak).toEqual({ dow: 2, hour: 10, total: 5 })
  })
})

describe("série diária e velocidade", () => {
  it("preenche os dias sem perguntas", () => {
    const points = fillDaily([{ day: "2026-10-10", total: 3, ai: 2, human: 1, open: 0 }], "2026-10-09", 3)
    expect(points.map((point) => point.day)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"])
    expect(points[0]).toMatchObject({ label: "09/10", total: 0 })
    expect(points[1]).toMatchObject({ ai: 2, human: 1 })
  })

  it("mostra a distribuição do tempo de resposta em %", () => {
    const points = speedDistribution([
      { bucket: 0, ai: 9, human: 0 },
      { bucket: 2, ai: 1, human: 1 },
      { bucket: 3, ai: 0, human: 3 },
    ])
    expect(points).toHaveLength(5)
    expect(points[0]).toMatchObject({ label: "Até 1 min", ai: 90, human: 0 })
    expect(points[3]).toMatchObject({ ai: 0, human: 75, humanCount: 3 })
  })
})

describe("assuntos mais perguntados", () => {
  it.each([
    ["Qual o prazo de envio para SP?", "frete"],
    ["Chega até sexta?", "frete"],
    ["Posso retirar na loja?", "retirada"],
    ["Vocês emitem nota fiscal?", "nota"],
    ["Tem garantia?", "garantia"],
    ["Aceita troca se não servir?", "garantia"],
    ["Faz por R$ 1.100 no pix?", "preco"],
    ["Tem desconto à vista?", "preco"],
    ["Serve para cabeça de 61 cm?", "medidas"],
    ["Essa bike aguenta 130 kg?", "medidas"],
    ["Qual o tamanho do quadro?", "medidas"],
    ["Serve no iPhone 12?", "compatibilidade"],
    ["Tem na cor azul?", "estoque"],
    ["Ainda tem disponível?", "estoque"],
    ["Vem montada?", "especificacoes"],
    ["É bivolt?", "especificacoes"],
    ["Tem para criança?", "outros"],
    ["", "outros"],
  ])("%s → %s", (text, topic) => {
    expect(classifyTopic(text)).toBe(topic)
  })

  it("ordena do mais perguntado e deixa 'outros' por último", () => {
    const { total, topics } = summarizeTopics([
      "Tem para criança?",
      "Qual o frete?",
      "Chega amanhã?",
      "Tem garantia?",
      "Tem garantia?",
      "Qual o prazo?",
      "  ",
    ])
    expect(total).toBe(6)
    expect(topics.map((topic) => topic.id)).toEqual(["frete", "garantia", "outros"])
    expect(topics[0]).toMatchObject({ count: 3, share: 50 })
    expect(topics[0].examples).toEqual(["Qual o frete?", "Chega amanhã?"])
    expect(topics[1].examples).toEqual(["Tem garantia?"])
  })
})

describe("formatação", () => {
  it("formata dinheiro, horas, dias e fator", () => {
    expect(formatCurrency(1234.5).replace(/\s/g, " ")).toBe("R$ 1.235")
    expect(formatCurrency(12.5).replace(/\s/g, " ")).toBe("R$ 12,50")
    expect(formatHours(0.5)).toBe("30 min")
    expect(formatHours(3.25)).toBe("3,3 h")
    expect(formatHours(120.4)).toBe("120 h")
    expect(formatWorkDays(0.5)).toBe("menos de 1 dia")
    expect(formatWorkDays(1)).toBe("1 dia")
    expect(formatWorkDays(2.6)).toBe("2,5 dias")
    expect(formatFactor(360)).toBe("360x")
  })
})