/**
 * Respostas ensinadas pelo vendedor: escolhe as mais parecidas com a pergunta do comprador.
 *
 * A semelhança é lexical, mas entende paráfrases comuns em pt-BR (sinônimos, flexões, "2 peças" = "mais de uma peça",
 * "1,62 e 60kg" = altura e peso). Ela só ORDENA e recorta: quem decide se uma ensinada se aplica é o modelo, que recebe
 * as melhores candidatas (ver prompt.ts). Por isso a seleção é generosa e as do próprio anúncio nunca ficam de fora.
 */

export type TaughtExample = {
  question: string
  answer: string
  itemId: string | null
  /** Última edição (ISO). Quando presente, as mais recentes vêm primeiro e vencem duplicatas. */
  updatedAt?: string | null
}

const STOPWORDS = new Set(
  [
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos",
    "nas", "ao", "aos", "para", "pra", "pro", "por", "pelo", "pela", "com", "sem", "que", "se", "ou", "mas", "tem",
    "ter", "tenho", "voces", "voce", "vc", "vcs", "isso", "esse", "essa", "este", "esta", "esses", "essas", "qual",
    "quais", "como", "quando", "onde", "mais", "muito", "sim", "nao", "bom", "boa", "dia", "tarde", "noite", "ola",
    "oi", "obrigado", "obrigada", "favor", "gostaria", "saber", "queria", "quero", "posso", "pode", "podem", "seria",
    "ele", "ela", "eles", "elas", "meu", "minha", "seu", "sua", "ja", "ate", "tambem", "so", "ser", "sao", "estou",
    "esta", "estao", "vem", "vou", "the", "and",
  ].map((word) => word.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
)

function stem(word: string) {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word
}

export function tokenize(text: string): Set<string> {
  const words = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOPWORDS.has(word))
  return new Set(words.map(stem))
}

// ---------------------------------------------------------------- semelhança para paráfrases (pt-BR)

/** Palavras que não dizem nada sobre o assunto (além das de `STOPWORDS`), vistas só na semelhança por conceito. */
const EXTRA_STOPWORDS = new Set(
  [
    "faco", "fazer", "faz", "fazem", "num", "numa", "nuns", "numas", "dele", "dela", "deles", "delas", "devo", "deve",
    "preciso", "precisa", "podemos", "poderia", "poderiam", "alguma", "algum", "alguns", "algumas", "pergunta",
    "duvida", "resposta", "informar", "informacao", "explicar", "tudo", "toda", "todo", "todos", "todas", "aqui",
    "essa", "isto", "aquele", "aquela", "entao", "assim", "porque", "porem", "pois", "estar", "esse",
  ].map((word) => word.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
)

/** Siglas curtas que dizem o assunto (nf = nota fiscal, cm, kg, nº). */
const SHORT_KEEP = new Set(["nf", "cm", "kg"])

const SUFFIXES = [
  "amentos", "imentos", "mente", "ando", "endo", "indo", "ados", "adas", "idos", "idas", "aram", "eram", "iram",
  "arei", "erei", "irei", "amos", "emos", "imos", "ado", "ada", "ido", "ida", "ou", "ei", "am", "ar", "er", "ir",
]

/** Raiz aproximada de uma palavra em pt-BR (plural, conjugação e gênero). Não precisa ser linguisticamente perfeita. */
function conceptStem(word: string): string {
  if (/\d/.test(word)) return word
  let result = word
  if (result.length > 4 && /(oes|aes)$/.test(result)) result = `${result.slice(0, -3)}ao`
  else if (result.length > 4 && result.endsWith("s")) result = result.slice(0, -1)
  for (const suffix of SUFFIXES) {
    if (result.endsWith(suffix) && result.length - suffix.length >= 4) {
      result = result.slice(0, -suffix.length)
      break
    }
  }
  if (result.length > 4 && /[aeo]$/.test(result)) result = result.slice(0, -1)
  return result
}

/** Grupos de palavras que, numa pergunta de comprador, querem dizer a mesma coisa. */
const SYNONYM_GROUPS: string[][] = [
  ["comprar", "compra", "compras", "pedido", "pedidos", "levar", "adquirir", "carrinho", "encomendar", "fechar", "pegar"],
  ["peca", "pecas", "item", "itens", "unidade", "unidades", "produto", "produtos"],
  ["mesmo", "mesma", "unico", "unica", "junto", "juntos", "juntas"],
  ["tamanho", "tamanhos", "numero", "numeros", "manequim", "tam", "numeracao", "grade"],
  ["medida", "medidas", "cintura", "quadril", "busto", "altura", "peso", "kg", "quilo", "quilos", "kilo", "centimetros", "cm", "metro", "metros"],
  ["entrega", "entregar", "entregue", "chegar", "chega", "chegam", "receber", "recebo", "prazo", "demora", "demorar", "dias"],
  ["frete", "envio", "enviar", "despacho", "despachar", "postagem", "postar", "correios"],
  ["troca", "trocas", "trocar", "devolucao", "devolver", "devolve"],
  ["nota", "nf", "fiscal", "danfe"],
  ["preco", "valor", "custa", "custo", "quanto"],
  ["desconto", "descontos", "promocao", "abatimento", "negociar", "negociacao", "barato", "baratinho"],
  ["pagamento", "pagar", "parcelar", "parcela", "parcelas", "parcelamento", "cartao", "pix", "boleto", "credito"],
  ["estoque", "disponivel", "disponibilidade", "disponiveis", "sobrando"],
  ["retirada", "retirar", "retiro", "buscar", "pessoalmente"],
  ["original", "genuino", "legitimo", "falsificado", "paralelo"],
  ["material", "tecido", "composicao", "feito"],
  ["lavar", "lavagem", "lavo", "encolher", "encolhe", "encolhimento"],
  ["voltagem", "volts", "bivolt", "tensao", "110v", "220v"],
  ["garantia", "garantir", "garante"],
  ["cor", "cores", "colorido"],
]

const SYNONYMS = new Map<string, string>()
for (const group of SYNONYM_GROUPS) {
  const canonical = conceptStem(group[0])
  for (const word of group) SYNONYMS.set(conceptStem(word), canonical)
}

/** Reescreve expressões inteiras (quantidade, altura, peso) em palavras-conceito antes de separar as palavras. */
function rewritePhrases(text: string) {
  return text
    .replace(/\bmais\s+de\s+(uma|um|duas|dois|tres|quatro|cinco|\d+)\b/g, " multiplos ")
    .replace(
      /\b(duas|dois|tres|quatro|cinco|seis|[2-9])\s+(pecas?|itens?|unidades?|produtos?|calcas?|vestidos?|blusas?|camisas?|camisetas?|pares?|kits?)\b/g,
      " multiplos $2 "
    )
    .replace(/\b(varias|varios|outra|outras|outro|outros|diferentes)\b/g, " multiplos ")
    .replace(/\b[12][.,]\d{2}\s*(m|metros?)?(?![\d.,]*\s*(kg|quilos?))\b/g, " altura medida ")
    .replace(/\b(1[4-9]\d|2[01]\d)\s*cm\b/g, " altura medida ")
    .replace(/\b\d{2,3}([.,]\d)?\s*(kg|kgs|quilos?|kilos?)\b/g, " peso medida ")
}

/** Palavras-conceito da pergunta: sem acentos, sem palavras vazias, com raiz e sinônimos unificados. */
export function conceptTokens(text: string): Set<string> {
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const words = rewritePhrases(plain)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(
      (word) =>
        (word.length >= 3 || /\d/.test(word) || SHORT_KEEP.has(word)) && !STOPWORDS.has(word) && !EXTRA_STOPWORDS.has(word)
    )
  return new Set(
    words.map((word) => {
      const root = conceptStem(word)
      return SYNONYMS.get(root) ?? root
    })
  )
}

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const word of a) if (b.has(word)) overlap++
  return overlap / Math.sqrt(a.size * b.size)
}

function coverage(target: Set<string>, text: Set<string>) {
  if (!target.size || !text.size) return 0
  let overlap = 0
  for (const word of target) if (text.has(word)) overlap++
  return overlap / target.size
}

/** Semelhança de 0 a 1 entre a pergunta do comprador e uma ensinada (pergunta ensinada + um pouco da resposta). */
export function taughtSimilarity(target: Set<string>, example: Pick<TaughtExample, "question" | "answer">) {
  const fromQuestion = similarity(target, conceptTokens(example.question))
  // A resposta também diz sobre o que a ensinada trata (ex.: uma tabela de tamanhos cobre "que número eu uso?").
  const fromAnswer = target.size >= 2 ? 0.25 * coverage(target, conceptTokens(example.answer)) : 0
  return Math.min(1, fromQuestion + fromAnswer)
}

/** A partir daqui a ensinada é tratada como "muito parecida" (o prompt dá a ela prioridade total). */
export const STRONG_SIMILARITY = 0.6

/**
 * Preferência pelas ensinadas do próprio anúncio: pequena quando elas não têm nada a ver com a pergunta (não pode
 * passar à frente de uma geral que responde exatamente) e cheia quando há alguma semelhança.
 */
function itemBonus(similarityValue: number) {
  return 0.05 + 0.2 * Math.min(1, similarityValue / 0.3)
}

export type RankedExample<T> = { example: T; score: number; similarity: number }

function sameQuestionKey(example: TaughtExample) {
  return [...conceptTokens(example.question)].sort().join(" ") || example.question.trim().toLowerCase()
}

/**
 * Ordena as respostas ensinadas pela semelhança com a pergunta, dando preferência às do mesmo anúncio. Em empate, mantém
 * a ordem recebida (mais recentes primeiro). `itemReserve` garante vaga para as ensinadas do próprio anúncio (uma loja
 * com muitas ensinadas gerais não pode empurrar para fora a tabela de medidas daquele anúncio).
 */
export function rankTaughtExamplesDetailed<T extends TaughtExample>(
  question: string,
  examples: T[],
  itemId: string | null,
  limit = 12,
  itemReserve = 0
): RankedExample<T>[] {
  const target = conceptTokens(question)
  const ranked = examples
    .map((example, index) => {
      const sim = taughtSimilarity(target, example)
      const scoped = Boolean(itemId && example.itemId === itemId)
      return { example, index, scoped, similarity: sim, score: sim + (scoped ? itemBonus(sim) : 0) }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const picked = new Set<number>()
  let reserved = 0
  for (const entry of ranked) {
    if (reserved >= itemReserve || picked.size >= limit) break
    if (entry.scoped) {
      picked.add(entry.index)
      reserved++
    }
  }
  for (const entry of ranked) {
    if (picked.size >= limit) break
    picked.add(entry.index)
  }
  return ranked
    .filter((entry) => picked.has(entry.index))
    .map(({ example, score, similarity: sim }) => ({ example, score, similarity: sim }))
}

/** Compatível com o uso antigo: só a lista ordenada. */
export function rankTaughtExamples<T extends TaughtExample>(question: string, examples: T[], itemId: string | null, limit = 12): T[] {
  return rankTaughtExamplesDetailed(question, examples, itemId, limit).map((entry) => entry.example)
}

/**
 * Escolhe as ensinadas que vão para o prompt. Regras, nesta ordem:
 * 1. escopo: ensinada de um anúncio só vale para ele; sem anúncio (null) vale para todos; a de outro anúncio nunca entra;
 * 2. versão mais recente: ordena por `updatedAt` e, se a mesma pergunta foi ensinada mais de uma vez, fica só a mais recente
 *    (e a do anúncio vence a geral);
 * 3. ranking por semelhança, com vaga garantida às do próprio anúncio.
 */
export function selectTaughtExamples<T extends TaughtExample>(
  question: string,
  examples: T[],
  itemId: string | null,
  options: { limit?: number; itemReserve?: number } = {}
): RankedExample<T>[] {
  const inScope = examples
    .map((example, index) => ({ example, index }))
    .filter(({ example }) => example.itemId === null || (itemId !== null && example.itemId === itemId))
    .sort((a, b) => {
      const left = a.example.updatedAt ?? ""
      const right = b.example.updatedAt ?? ""
      return left === right ? a.index - b.index : left < right ? 1 : -1
    })
    .map(({ example }) => example)

  const seen = new Map<string, T>()
  for (const example of inScope) {
    const key = sameQuestionKey(example)
    const kept = seen.get(key)
    if (!kept) seen.set(key, example)
    else if (kept.itemId === null && example.itemId !== null) seen.set(key, example)
  }
  const unique = inScope.filter((example) => seen.get(sameQuestionKey(example)) === example)

  return rankTaughtExamplesDetailed(question, unique, itemId, options.limit ?? 12, options.itemReserve ?? 6)
}
