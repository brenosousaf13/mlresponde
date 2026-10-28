import { describe, expect, it } from "vitest"

import { loadTaughtExamples } from "@/lib/answers/context"
import {
  STRONG_SIMILARITY,
  conceptTokens,
  rankTaughtExamples,
  selectTaughtExamples,
  taughtSimilarity,
} from "@/lib/answers/examples"
import { buildMessages, buildSystemPrompt } from "@/lib/answers/prompt"
import { buildAfterSaleSystemPrompt } from "@/lib/after-sale/prompt"
import type { createServiceClient } from "@/lib/supabase/admin"

type Row = { item_id: string | null; question_text: string; answer_text: string; updated_at: string }
type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Banco de mentira: devolve sempre o que está em `state.rows` NO MOMENTO da consulta (sem guardar nada) e ignora de
 * propósito os filtros de escopo, para provar que o código também filtra por conta própria. Registra as chamadas.
 */
function fakeAdmin(state: { rows: Row[] }) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "order", "limit", "or", "is"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  builder.then = (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: structuredClone(state.rows), error: null })
  const tables: string[] = []
  const admin = {
    from(table: string) {
      tables.push(table)
      return builder
    },
  } as unknown as ServiceClient
  return { admin, calls, tables }
}

const MULTI_QUESTION = "Como eu faço para comprar mais de uma peça na mesma compra?"
const MULTI_OLD = "Para comprar mais de uma peça no mesmo pedido, adicione cada peça desejada ao carrinho e finalize a compra de todas juntas."
const MULTI_NEW =
  "Olá! Para comprar mais de uma peça no mesmo pedido, basta selecionar o modelo, a cor e o tamanho desejados e adicionar ao carrinho. Em seguida, volte ao anúncio, escolha a outra peça e adicione também. No carrinho, confira tudo e finalize."

const SIZE_QUESTION = "Minha cintura é X, quadril Y e altura Z, qual calça eu devo comprar?"
const SIZE_ANSWER =
  "Para escolher o tamanho, use a altura e o peso: 34 (1,50 a 1,60 m, 45 a 52 kg); 36 (1,52 a 1,63 m, 50 a 58 kg); 38 (1,55 a 1,66 m, 56 a 65 kg); 40 (1,58 a 1,70 m, 63 a 73 kg); 42 (1,60 a 1,73 m, 70 a 80 kg); 44 (1,62 a 1,76 m, 77 a 88 kg); 46 (1,65 a 1,80 m, 85 a 98 kg)."
const SIZE_ITEM = "MLB5000000001"

const baseInput = { storeName: "Menina Linda", tone: "cordial" as const, knowledge: "", sellerRules: "" }

describe("loadTaughtExamples: sempre lê o texto atual", () => {
  it("edição vale na próxima pergunta, sem cópia antiga", async () => {
    const state: { rows: Row[] } = {
      rows: [{ item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_OLD, updated_at: "2026-10-27T10:00:00Z" }],
    }
    const { admin } = fakeAdmin(state)

    const before = await loadTaughtExamples(admin, "acc-1", null, MULTI_QUESTION)
    expect(before.map((example) => example.answer)).toEqual([MULTI_OLD])

    state.rows = [{ item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_NEW, updated_at: "2026-10-28T14:20:00Z" }]
    const after = await loadTaughtExamples(admin, "acc-1", null, MULTI_QUESTION)
    expect(after.map((example) => example.answer)).toEqual([MULTI_NEW])
    expect(after[0].answer).not.toContain("finalize a compra de todas juntas")
  })

  it("exclusão vale na próxima pergunta", async () => {
    const state: { rows: Row[] } = {
      rows: [{ item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_NEW, updated_at: "2026-10-28T14:20:00Z" }],
    }
    const { admin } = fakeAdmin(state)
    expect(await loadTaughtExamples(admin, "acc-1", null, MULTI_QUESTION)).toHaveLength(1)

    state.rows = []
    expect(await loadTaughtExamples(admin, "acc-1", null, MULTI_QUESTION)).toEqual([])
  })

  it("consulta a conta certa, na tabela certa, pelas mais recentemente editadas e sem cache", async () => {
    const { admin, calls, tables } = fakeAdmin({ rows: [] })
    await loadTaughtExamples(admin, "acc-1", "MLB1", "qualquer coisa")
    await loadTaughtExamples(admin, "acc-1", "MLB1", "qualquer coisa")
    expect(tables).toEqual(["ai_examples", "ai_examples"])
    expect(calls.filter((call) => call.method === "eq")).toEqual([
      { method: "eq", args: ["ml_account_id", "acc-1"] },
      { method: "eq", args: ["ml_account_id", "acc-1"] },
    ])
    expect(calls).toContainEqual({ method: "order", args: ["updated_at", { ascending: false }] })
    expect(calls).toContainEqual({ method: "or", args: ["item_id.eq.MLB1,item_id.is.null"] })
  })

  it("sem anúncio, só consulta as ensinadas gerais", async () => {
    const { admin, calls } = fakeAdmin({ rows: [] })
    await loadTaughtExamples(admin, "acc-1", null, "qualquer coisa")
    expect(calls).toContainEqual({ method: "is", args: ["item_id", null] })
    expect(calls.some((call) => call.method === "or")).toBe(false)
  })

  it("a mesma pergunta ensinada duas vezes: vale só a versão mais recente", async () => {
    const { admin } = fakeAdmin({
      rows: [
        { item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_OLD, updated_at: "2026-10-01T10:00:00Z" },
        { item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_NEW, updated_at: "2026-10-28T14:20:00Z" },
      ],
    })
    const loaded = await loadTaughtExamples(admin, "acc-1", null, MULTI_QUESTION)
    expect(loaded.map((example) => example.answer)).toEqual([MULTI_NEW])
  })

  it("devolve escopo, data e semelhança para o prompt", async () => {
    const { admin } = fakeAdmin({
      rows: [
        { item_id: SIZE_ITEM, question_text: SIZE_QUESTION, answer_text: SIZE_ANSWER, updated_at: "2026-10-28T14:20:00Z" },
        { item_id: null, question_text: MULTI_QUESTION, answer_text: MULTI_NEW, updated_at: "2026-10-27T09:00:00Z" },
      ],
    })
    const loaded = await loadTaughtExamples(admin, "acc-1", SIZE_ITEM, "tenho 1,62 e 60kg, que número?")
    expect(loaded[0]).toMatchObject({ question: SIZE_QUESTION, scope: "item", updatedAt: "2026-10-28T14:20:00Z" })
    expect(loaded[0].similarity).toBeGreaterThan(loaded[1].similarity ?? 1)
    expect(loaded[1]).toMatchObject({ scope: "store" })
  })
})

describe("escopo por anúncio", () => {
  const rows: Row[] = [
    { item_id: "MLB1", question_text: "Vem montada?", answer_text: "do anúncio 1", updated_at: "2026-10-28T10:00:00Z" },
    { item_id: "MLB2", question_text: "Vem montada?", answer_text: "do anúncio 2", updated_at: "2026-10-28T11:00:00Z" },
    { item_id: null, question_text: "Aceita troca?", answer_text: "geral", updated_at: "2026-10-28T09:00:00Z" },
  ]

  it("ensinada de um anúncio só entra nesse anúncio; a de outro nunca entra; a geral entra em todos", async () => {
    const { admin } = fakeAdmin({ rows })
    const forOne = await loadTaughtExamples(admin, "acc-1", "MLB1", "Vem montada? aceita troca?")
    expect(forOne.map((example) => example.answer).sort()).toEqual(["do anúncio 1", "geral"])
    const forTwo = await loadTaughtExamples(admin, "acc-1", "MLB2", "Vem montada? aceita troca?")
    expect(forTwo.map((example) => example.answer).sort()).toEqual(["do anúncio 2", "geral"])
    const forThree = await loadTaughtExamples(admin, "acc-1", "MLB3", "Vem montada? aceita troca?")
    expect(forThree.map((example) => example.answer)).toEqual(["geral"])
  })

  it("sem anúncio (pergunta sem item), nenhuma ensinada de anúncio entra", async () => {
    const { admin } = fakeAdmin({ rows })
    const loaded = await loadTaughtExamples(admin, "acc-1", null, "Vem montada?")
    expect(loaded.map((example) => example.answer)).toEqual(["geral"])
  })

  it("a ensinada do anúncio vence a geral para a mesma pergunta", () => {
    const picked = selectTaughtExamples(
      "Vem montada?",
      [
        { question: "Vem montada?", answer: "geral", itemId: null, updatedAt: "2026-10-28T12:00:00Z" },
        { question: "Vem montada?", answer: "do anúncio", itemId: "MLB1", updatedAt: "2026-10-01T12:00:00Z" },
      ],
      "MLB1"
    )
    expect(picked.map((entry) => entry.example.answer)).toEqual(["do anúncio"])
  })
})

describe("ranking de paráfrases", () => {
  const library = [
    { question: "Qual o prazo de entrega para o Rio?", answer: "Despachamos em 1 dia útil.", itemId: null },
    { question: "Aceita troca?", answer: "Aceitamos troca em até 7 dias.", itemId: null },
    { question: "Vocês emitem nota fiscal?", answer: "Sim, todas as vendas têm nota.", itemId: null },
    { question: "Qual a forma de pagamento? Parcela em quantas vezes?", answer: "Em até 12x no cartão.", itemId: null },
    { question: MULTI_QUESTION, answer: MULTI_NEW, itemId: null },
    { question: SIZE_QUESTION, answer: SIZE_ANSWER, itemId: SIZE_ITEM },
  ]
  const first = (question: string, itemId: string | null = SIZE_ITEM) => rankTaughtExamples(question, library, itemId, 1)[0].answer

  it.each([
    "quero levar 2 peças num pedido só",
    "posso comprar duas peças juntas?",
    "como compro várias peças de uma vez?",
    "dá pra pedir mais de um item no mesmo pedido?",
    "Quero comprar 3 unidades, preciso fazer pedidos separados?",
  ])("'%s' encontra a ensinada de comprar mais de uma peça", (question) => {
    expect(first(question)).toBe(MULTI_NEW)
  })

  it.each([
    "tenho 1,62 e 60kg, que número?",
    "sou 1.70 e peso 68 kg qual tamanho pego?",
    "minha altura é 165 cm e peso 62kg, qual manequim?",
  ])("'%s' encontra a ensinada de tamanho por altura e peso", (question) => {
    expect(first(question)).toBe(SIZE_ANSWER)
  })

  it("continua achando as ensinadas de assuntos simples com outras palavras", () => {
    expect(first("tem nf?")).toBe("Sim, todas as vendas têm nota.")
    expect(first("posso devolver se não servir?")).toBe("Aceitamos troca em até 7 dias.")
    expect(first("dá pra parcelar no cartão?")).toBe("Em até 12x no cartão.")
    expect(first("quanto tempo demora pra chegar no Rio?")).toBe("Despachamos em 1 dia útil.")
  })

  it("perguntas sem relação não ficam 'muito parecidas' com nada", () => {
    const target = conceptTokens("A cor azul é mais escura que na foto?")
    for (const example of library) expect(taughtSimilarity(target, example)).toBeLessThan(STRONG_SIMILARITY)
  })

  it("o 'muito parecida' aparece para a paráfrase clara", () => {
    const target = conceptTokens("quero levar 2 peças num pedido só")
    expect(taughtSimilarity(target, library[4])).toBeGreaterThanOrEqual(STRONG_SIMILARITY)
  })

  it("loja com muitas ensinadas gerais não empurra para fora a do próprio anúncio", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      question: `Pergunta geral número ${index} sobre calça e tamanho`,
      answer: `geral ${index}`,
      itemId: null,
    }))
    const picked = selectTaughtExamples("Bom dia", [...many, { question: SIZE_QUESTION, answer: SIZE_ANSWER, itemId: SIZE_ITEM }], SIZE_ITEM, {
      limit: 5,
    })
    expect(picked).toHaveLength(5)
    expect(picked.map((entry) => entry.example.answer)).toContain(SIZE_ANSWER)
  })
})

describe("prompt: a ensinada tem prioridade sobre qualquer outra fonte", () => {
  const taught = [{ question: MULTI_QUESTION, answer: MULTI_NEW, scope: "store" as const, similarity: 0.9, updatedAt: "2026-10-28T14:20:00Z" }]

  it("a seção de prioridade vem antes das regras genéricas e do estilo, e cita todas as outras fontes", () => {
    const prompt = buildSystemPrompt({ ...baseInput, taughtExamples: taught })
    const priority = prompt.indexOf("# RESPOSTAS ENSINADAS: PRIORIDADE MÁXIMA")
    expect(priority).toBeGreaterThan(-1)
    expect(priority).toBeLessThan(prompt.indexOf("# O que vale para qualquer compra"))
    expect(priority).toBeLessThan(prompt.indexOf("# Estilo"))
    const section = prompt.slice(priority, prompt.indexOf("# Como usar as fontes"))
    expect(section).toContain("vale mais do que qualquer outra fonte")
    expect(section).toContain("regras gerais")
    expect(section).toContain("CONHECIMENTO_DA_LOJA")
    expect(section).toContain("PERGUNTAS_JA_RESPONDIDAS_NESTE_ANUNCIO")
    expect(section).toContain("Nunca troque o conteúdo dela por uma regra genérica")
    expect(section).toContain("data mais recente")
  })

  it("a regra fixa 'adicione ao carrinho' sai quando há ensinada muito parecida e fica condicional quando não há", () => {
    const strong = buildSystemPrompt({ ...baseInput, taughtExamples: taught })
    expect(strong).not.toContain("basta adicionar cada uma ao carrinho")

    const weak = buildSystemPrompt({ ...baseInput, taughtExamples: [{ ...taught[0], similarity: 0.1 }] })
    expect(weak).toContain("só se NÃO houver RESPOSTA_ENSINADA sobre isso")
    expect(weak).toContain("(só quando nenhuma RESPOSTA_ENSINADA trata do mesmo assunto)")

    const none = buildSystemPrompt({ ...baseInput, taughtExamples: [] })
    expect(none).toContain("basta adicionar cada uma ao carrinho")
    expect(none).not.toContain("PRIORIDADE MÁXIMA")
  })

  it("a ensinada pode passar de 3 frases e preserva passos; só entra a exceção quando há ensinada", () => {
    const withTaught = buildSystemPrompt({ ...baseInput, taughtExamples: taught })
    expect(withTaught).toContain("Exceção: quando a resposta se baseia numa RESPOSTA_ENSINADA, mantenha todos os passos")
    expect(withTaught).toContain("1.500 caracteres")
    expect(withTaught).toContain("Nunca resuma de modo que se percam passos")
    expect(buildSystemPrompt({ ...baseInput, taughtExamples: [] })).not.toContain("Exceção: quando a resposta se baseia")
  })

  it("o texto completo da versão atual vai ao modelo, com escopo, data e aviso de semelhança", () => {
    const [system] = buildMessages({ ...baseInput, itemSummary: "Título: Calça", taughtExamples: taught, previousQnA: [], question: "quero levar 2 peças" })
    expect(system.content).toContain(MULTI_NEW)
    expect(system.content).not.toContain(MULTI_OLD)
    expect(system.content).toContain("[vale para todos os anúncios da loja] [MUITO PARECIDA COM A PERGUNTA] [ensinada em 28/10/2026]")
  })

  it("as respostas anteriores do anúncio ficam abaixo das ensinadas", () => {
    const [, user] = buildMessages({
      ...baseInput,
      itemSummary: "Título: Calça",
      taughtExamples: taught,
      previousQnA: [{ question: "Posso levar duas?", answer: "Sim, adicione ao carrinho." }],
      question: "Posso levar duas?",
    })
    expect(user.content).toContain("Prioridade menor que a das RESPOSTAS_ENSINADAS_PELO_VENDEDOR")
  })

  it("vale também no modo responder sempre", () => {
    const prompt = buildSystemPrompt({ ...baseInput, mode: "always", taughtExamples: taught })
    expect(prompt).toContain("PRIORIDADE MÁXIMA")
    expect(prompt).toContain("MODO RESPONDER SEMPRE")
  })

  it("ensinada com tabela: manda aplicar aos dados do comprador, sem colar a tabela e sem inventar", () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      taughtExamples: [{ question: SIZE_QUESTION, answer: SIZE_ANSWER, scope: "item", similarity: 0.4 }],
    })
    expect(prompt).toContain(SIZE_ANSWER)
    expect(prompt).toContain("[vale só para este anúncio]")
    expect(prompt).toContain("aplique a tabela a esses dados e entregue o resultado")
    expect(prompt).toContain("sem colar a tabela inteira")
    expect(prompt).toContain("peça esse dado ao comprador em vez de chutar")
    expect(prompt).toContain("fora da tabela ou entre dois tamanhos")
    expect(prompt).toContain("Não acrescente nada que não esteja nela")
    expect(prompt).toContain("inclusive a tabela de uma RESPOSTA_ENSINADA")
    expect(prompt).toContain("REGRA 0 — NUNCA INVENTE")
  })

  it("não copia ao pé da letra: manda adaptar à pergunta real", () => {
    const prompt = buildSystemPrompt({ ...baseInput, taughtExamples: taught })
    expect(prompt).toContain("Não copie ao pé da letra: adapte à pergunta real do comprador")
    expect(prompt).toContain("mesma intenção")
  })
})

describe("pós-venda: mesma prioridade para as ensinadas", () => {
  const input = {
    storeName: "Menina Linda",
    tone: "cordial" as const,
    knowledge: "",
    sellerRules: "",
    instructions: "",
    sensitivePolicy: "review" as const,
    orderSummary: "Pedido 1",
    shippingSummary: "Envio",
    itemSummary: null,
    history: [],
    maxChars: 350,
    now: new Date("2026-10-28T12:00:00Z"),
  }

  it("com ensinadas, o prompt manda priorizá-las; sem ensinadas, a seção não existe", () => {
    const withExamples = buildAfterSaleSystemPrompt({ ...input, examples: [{ buyerMessage: "Quando envia?", answer: "Em 1 dia útil." }] })
    expect(withExamples).toContain("# RESPOSTAS ENSINADAS: PRIORIDADE MÁXIMA")
    expect(withExamples).toContain("vale mais do que qualquer outra fonte")
    expect(buildAfterSaleSystemPrompt({ ...input, examples: [] })).not.toContain("PRIORIDADE MÁXIMA")
  })
})