/**
 * Melhorias de anúncio — prompt da IA (puro, testado em tests/unit/listing-improvements.test.ts).
 * A IA lê o anúncio como está e as perguntas que ele recebeu (com a resposta do vendedor, quando houver) e sugere o
 * que mudar no anúncio para os compradores encontrarem a resposta sem precisar perguntar.
 */

export const IMPROVEMENT_AREAS = ["titulo", "descricao", "ficha_tecnica", "fotos", "variacoes", "condicoes", "outro"] as const
export type ImprovementArea = (typeof IMPROVEMENT_AREAS)[number]

export const IMPROVEMENT_PRIORITIES = ["alta", "media", "baixa"] as const
export type ImprovementPriority = (typeof IMPROVEMENT_PRIORITIES)[number]

/** Quantas perguntas entram na análise (as mais recentes) e o tamanho de cada texto. */
export const MAX_ANALYZED_QUESTIONS = 120
export const MIN_ANALYZED_QUESTIONS = 3
const QUESTION_CHARS = 300
const ANSWER_CHARS = 400
/** Limite de título do Mercado Livre na maioria das categorias. */
export const ML_TITLE_LIMIT = 60

export type ImprovementQuestion = { text: string; answer: string | null; askedAt: string | null }

export type ImprovementPromptInput = {
  storeName: string
  itemSummary: string
  isCatalog: boolean
  periodDays: number
  questions: ImprovementQuestion[]
}

export const IMPROVEMENT_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string", enum: [...IMPROVEMENT_AREAS] },
          priority: { type: "string", enum: [...IMPROVEMENT_PRIORITIES] },
          title: { type: "string" },
          problem: { type: "string" },
          action: { type: "string" },
          ready_text: { type: "string" },
          needs_seller_info: { type: "boolean" },
          question_count: { type: "integer" },
          example_questions: { type: "array", items: { type: "string" } },
        },
        required: [
          "area",
          "priority",
          "title",
          "problem",
          "action",
          "ready_text",
          "needs_seller_info",
          "question_count",
          "example_questions",
        ],
      },
    },
  },
  required: ["summary", "suggestions"],
} as const

function clean(text: string | null | undefined, limit: number) {
  const value = (text ?? "").replace(/\s+/g, " ").trim()
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

export function buildImprovementSystemPrompt(storeName: string): string {
  return [
    `Você é um consultor de anúncios do Mercado Livre e trabalha para a loja "${clean(storeName, 120) || "do vendedor"}".`,
    "Seu objetivo: diminuir as perguntas repetidas que os compradores fazem, deixando a resposta visível no próprio anúncio. Menos perguntas = menos trabalho para a loja e mais compras sem dúvida.",
    "",
    "# O que você recebe",
    "- ANUNCIO: o anúncio como ele está hoje (título, preço, condições de venda, ficha técnica, variações, descrição).",
    "- PERGUNTAS: perguntas reais que o anúncio recebeu, das mais recentes para as mais antigas, com a resposta do vendedor quando houve. As respostas do vendedor são a melhor fonte do que falta no anúncio.",
    "",
    "# Como analisar",
    "1. Agrupe as perguntas pela informação que elas pedem (medidas, material, voltagem, compatibilidade, cor, prazo, garantia, como usar...).",
    "2. Para cada grupo que se repete, confira se a informação já está no ANUNCIO. Se não está, sugira incluir. Se está mas os compradores continuam perguntando, sugira deixar mais visível (título, primeiras linhas da descrição ou o atributo certo da ficha técnica).",
    "3. Ignore o que o anúncio não resolve: pedido de desconto ou negociação, pergunta sobre um pedido já feito, pedido de contato, ofensa e perguntas isoladas que não se repetem. \"Ainda tem?\" / \"tem disponível?\" só vira sugestão se for muito frequente (manter o estoque e as variações em dia).",
    "4. Junte sugestões parecidas. Ordene da que evita mais perguntas para a que evita menos. No máximo 6 sugestões; se as perguntas não seguem um padrão, devolva poucas (ou nenhuma) e explique no resumo.",
    "",
    "# Regra 0 — nunca invente",
    "- Use só informações do ANUNCIO e das respostas do vendedor. Nunca invente medida, material, prazo, garantia, compatibilidade ou qualquer dado do produto.",
    "- Quando a informação necessária não aparece em lugar nenhum, escreva o texto pronto com um espaço para o vendedor completar entre colchetes (ex.: \"Voltagem: [informe 110 V, 220 V ou bivolt]\") e marque needs_seller_info=true.",
    "",
    "# Regras do Mercado Livre",
    `- Título: no máximo ${ML_TITLE_LIMIT} caracteres, no formato produto + marca + modelo + característica principal. Sem palavras promocionais (promoção, oferta, frete grátis, menor preço), sem símbolos e sem repetir palavras. Só sugira mudar o título quando isso realmente responder uma dúvida frequente.`,
    "- Descrição: texto simples (sem HTML, sem markdown, sem emojis), frases curtas, uma informação por linha. Nada de telefone, e-mail, site, redes sociais, link ou pagamento fora do Mercado Livre.",
    "- Ficha técnica: diga o nome do atributo (ex.: \"Material\", \"Voltagem\", \"Comprimento\") e o valor a preencher. Atributos completos também ajudam o anúncio a aparecer nas buscas e nos filtros.",
    "- Fotos: diga qual foto responderia a dúvida (ex.: com régua mostrando a medida, da etiqueta, do produto em uso). Deixe ready_text vazio.",
    "- Variações: se perguntam por cores, tamanhos ou modelos, sugira criar as variações ou listar na descrição as que existem.",
    "- Condições: garantia, prazo de envio ou de fabricação, nota fiscal e retirada ficam nas condições de venda do anúncio.",
    "- Anúncio de catálogo: o título e a ficha técnica vêm do catálogo do Mercado Livre e o vendedor não muda sozinho. Prefira descrição, fotos e condições; se um dado do catálogo estiver errado, sugira pedir a correção ao Mercado Livre.",
    "",
    "# Formato da resposta (para o vendedor, em português do Brasil, tratando por você, direto e sem jargão)",
    "- summary: 1 a 3 frases sobre o que os compradores mais perguntam e a mudança que mais vai ajudar.",
    "- Em cada sugestão: area; priority (alta = evita muitas perguntas ou dúvida que trava a compra; media; baixa); title (curto, começa com verbo, ex.: \"Informe as medidas na descrição\"); problem (o que os compradores perguntam, com números); action (o que mudar e onde, em 1 ou 2 frases); ready_text (o texto pronto para copiar e colar no anúncio, ou vazio quando não se aplica); needs_seller_info; question_count (quantas das perguntas analisadas essa mudança evitaria — conte de verdade); example_questions (até 3 perguntas copiadas da lista, sem mudar o texto).",
  ].join("\n")
}

export function formatQuestionsForPrompt(questions: ImprovementQuestion[]): string {
  return questions
    .slice(0, MAX_ANALYZED_QUESTIONS)
    .map((question, index) => {
      const day = question.askedAt ? `[${DAY_FORMAT.format(new Date(question.askedAt))}] ` : ""
      const answer = clean(question.answer, ANSWER_CHARS)
      return `${index + 1}. ${day}P: ${clean(question.text, QUESTION_CHARS)}${answer ? `\n   Resposta do vendedor: ${answer}` : ""}`
    })
    .join("\n")
}

export function buildImprovementMessages(input: ImprovementPromptInput) {
  const total = Math.min(input.questions.length, MAX_ANALYZED_QUESTIONS)
  const user = [
    "<ANUNCIO>",
    input.itemSummary.trim(),
    "</ANUNCIO>",
    `Anúncio de catálogo: ${input.isCatalog ? "sim" : "não"}`,
    "",
    `<PERGUNTAS total="${total}" periodo="últimos ${input.periodDays} dias">`,
    formatQuestionsForPrompt(input.questions),
    "</PERGUNTAS>",
    "",
    "Analise e devolva as sugestões no formato pedido.",
  ].join("\n")
  return [
    { role: "system" as const, content: buildImprovementSystemPrompt(input.storeName) },
    { role: "user" as const, content: user },
  ]
}
