import { describe, expect, it } from "vitest"

import { rankTaughtExamples, tokenize } from "@/lib/answers/examples"
import {
  compileSellerRules,
  compileStoreKnowledge,
  parseStoreProfile,
  profileProgress,
  storeNameFrom,
  validateAnswer,
  withAnswer,
} from "@/lib/assistant/profile"
import { PROFILE_QUESTIONS, SETUP_SECTIONS, SETUP_STEPS, findQuestion } from "@/lib/assistant/questions"
import { parseInboxTab, questionTone, sanitizeSearch } from "@/lib/questions/presentation"

const question = (id: string) => {
  const found = findQuestion(id)
  if (!found) throw new Error(`pergunta ${id} não existe`)
  return found
}

describe("roteiro da configuração", () => {
  it("tem ids únicos, seções válidas e opções com valores únicos", () => {
    const ids = PROFILE_QUESTIONS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sections = new Set(SETUP_SECTIONS.map((section) => section.id))
    for (const item of SETUP_STEPS) expect(sections.has(item.section)).toBe(true)
    for (const item of PROFILE_QUESTIONS) {
      if (item.kind === "choice" || item.kind === "multi") {
        expect(item.options?.length).toBeGreaterThan(1)
        const values = item.options!.map((option) => option.value)
        expect(new Set(values).size).toBe(values.length)
      } else {
        expect(item.options).toBeUndefined()
      }
    }
  })

  it("segue a ordem das seções (a barra lateral depende disso)", () => {
    const order = SETUP_SECTIONS.map((section) => section.id)
    const indexes = SETUP_STEPS.map((step) => order.indexOf(step.section))
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
  })
})

describe("validateAnswer", () => {
  it("aceita escolha válida e limpa o texto", () => {
    expect(validateAnswer(question("invoice"), { options: ["sempre"], text: "  CNPJ na compra.  " })).toEqual({
      ok: true,
      answer: { options: ["sempre"], text: "CNPJ na compra." },
    })
  })

  it("recusa opção desconhecida, duas opções em escolha única e opções em texto livre", () => {
    expect(validateAnswer(question("invoice"), { options: ["talvez"] }).ok).toBe(false)
    expect(validateAnswer(question("invoice"), { options: ["sempre", "nao"] }).ok).toBe(false)
    expect(validateAnswer(question("store_about"), { options: ["x"], text: "a" }).ok).toBe(false)
  })

  it("aceita várias opções na múltipla escolha, na ordem do roteiro", () => {
    expect(validateAnswer(question("shipping_methods"), { options: ["flex", "full"] })).toEqual({
      ok: true,
      answer: { options: ["full", "flex"], text: "" },
    })
  })

  it("resposta vazia apaga, exceto quando obrigatória", () => {
    expect(validateAnswer(question("warranty"), { options: [], text: " " })).toEqual({ ok: true, answer: null })
    expect(validateAnswer(question("store_name"), { text: "" }).ok).toBe(false)
  })

  it("respeita o limite de caracteres", () => {
    const limit = question("service_hours").maxLength
    expect(validateAnswer(question("service_hours"), { text: "a".repeat(limit + 1) }).ok).toBe(false)
  })
})

describe("parseStoreProfile", () => {
  it("ignora lixo, perguntas e opções desconhecidas", () => {
    expect(parseStoreProfile(null)).toEqual({})
    expect(parseStoreProfile([1, 2])).toEqual({})
    expect(
      parseStoreProfile({
        invoice: { options: ["sempre", "inventada"], text: 3 },
        nao_existe: { options: [], text: "x" },
        warranty: { options: [], text: "" },
        store_name: "texto solto",
      })
    ).toEqual({ invoice: { options: ["sempre"], text: "" } })
  })

  it("withAnswer adiciona e remove respostas sem mexer no original", () => {
    const original = { invoice: { options: ["sempre"], text: "" } }
    const changed = withAnswer(original, "warranty", { options: ["loja"], text: "90 dias" })
    expect(Object.keys(changed)).toEqual(["invoice", "warranty"])
    expect(Object.keys(withAnswer(changed, "invoice", null))).toEqual(["warranty"])
    expect(Object.keys(original)).toEqual(["invoice"])
  })
})

describe("compileStoreKnowledge", () => {
  const profile = parseStoreProfile({
    store_name: { options: [], text: "Casa da Bike" },
    store_about: { options: [], text: "Bicicletas e acessórios." },
    sizing: { options: ["nao_se_aplica"], text: "" },
    invoice: { options: ["sempre"], text: "Para CNPJ, informe na compra." },
    product_details: { options: [], text: "Calça Mom: bolso da frente decorativo.\nCargo Jogger: sem bolso atrás." },
    special_rules: { options: [], text: "Nunca falar da marca X." },
  })
  const knowledge = compileStoreKnowledge(profile, "Férias coletivas em janeiro.")

  it("organiza por seção, usando os fatos das opções e os detalhes do vendedor", () => {
    expect(knowledge).toContain("## Sua loja\n- Nome da loja: Casa da Bike\n- O que a loja vende:\n  Bicicletas e acessórios.")
    expect(knowledge).toContain(
      "- Nota fiscal: A loja emite nota fiscal em todos os pedidos. Detalhes do vendedor: Para CNPJ, informe na compra."
    )
    expect(knowledge).toContain("  Calça Mom: bolso da frente decorativo.\n  Cargo Jogger: sem bolso atrás.")
    expect(knowledge).toContain("## Outras informações do vendedor\nFérias coletivas em janeiro.")
  })

  it("não inclui 'não se aplica', seções vazias nem as regras especiais (vão à parte)", () => {
    expect(knowledge).not.toContain("tamanho")
    expect(knowledge).not.toContain("## Garantia e trocas")
    expect(knowledge).not.toContain("marca X")
    expect(compileSellerRules(profile)).toBe("Nunca falar da marca X.")
  })

  it("nome da loja e progresso", () => {
    expect(storeNameFrom(profile, "Org")).toBe("Casa da Bike")
    expect(storeNameFrom({}, "Org")).toBe("Org")
    expect(profileProgress(profile)).toEqual({ answered: 6, total: PROFILE_QUESTIONS.length })
    expect(compileStoreKnowledge({}, "")).toBe("")
  })
})

describe("rankTaughtExamples", () => {
  const examples = [
    { question: "Qual o prazo de entrega para o Rio?", answer: "a", itemId: null },
    { question: "Aceita troca?", answer: "b", itemId: null },
    { question: "Vem montada?", answer: "c", itemId: "MLB1" },
    { question: "Vocês emitem nota fiscal?", answer: "d", itemId: null },
  ]

  it("ignora acentos, maiúsculas, plurais e palavras vazias", () => {
    expect([...tokenize("Vocês emitem NOTAS fiscais?")]).toEqual(["emitem", "nota", "fiscai"])
  })

  it("coloca primeiro a ensinada mais parecida, mesmo sendo antiga", () => {
    expect(rankTaughtExamples("Tem nota fiscal?", examples, "MLB2", 2)[0].answer).toBe("d")
    expect(rankTaughtExamples("Posso trocar se não servir? aceita troca", examples, "MLB2", 1)[0].answer).toBe("b")
  })

  it("dá preferência às do mesmo anúncio e mantém a ordem nos empates", () => {
    expect(rankTaughtExamples("Bom dia", examples, "MLB1").map((example) => example.answer)).toEqual(["c", "a", "b", "d"])
    expect(rankTaughtExamples("Bom dia", examples, null).map((example) => example.answer)).toEqual(["a", "b", "c", "d"])
  })
})

describe("apresentação das perguntas", () => {
  it.each([
    ["needs_review", null, "open"],
    ["failed", null, "open"],
    ["processing", null, "queue"],
    ["answered", "ai", "ai"],
    ["answered", "manual", "manual"],
    ["answered_outside", "external", "external"],
    ["ignored", null, "archived"],
  ])("%s/%s → %s", (status, source, tone) => {
    expect(questionTone(status, source)).toBe(tone)
  })

  it("aceita as abas antigas e cai em 'Para responder'", () => {
    expect(parseInboxTab("ia")).toBe("ia")
    expect(parseInboxTab("revisar")).toBe("responder")
    expect(parseInboxTab("respondidas")).toBe("ia")
    expect(parseInboxTab("xyz")).toBe("responder")
    expect(parseInboxTab(undefined)).toBe("responder")
  })

  it("limpa a busca para o filtro do banco", () => {
    expect(sanitizeSearch("  bolso, (frente)*  ")).toBe("bolso frente")
    expect(sanitizeSearch(["x"])).toBe("")
    expect(sanitizeSearch("a".repeat(200))).toHaveLength(80)
  })
})
