/** Respostas ensinadas pelo vendedor: escolhe as mais parecidas com a pergunta do comprador. */

export type TaughtExample = {
  question: string
  answer: string
  itemId: string | null
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

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const word of a) if (b.has(word)) overlap++
  return overlap / Math.sqrt(a.size * b.size)
}

/**
 * Ordena as respostas ensinadas pela semelhança com a pergunta (palavras em comum), dando preferência às do
 * mesmo anúncio. Em empate, mantém a ordem recebida (mais recentes primeiro).
 */
export function rankTaughtExamples<T extends TaughtExample>(question: string, examples: T[], itemId: string | null, limit = 12): T[] {
  const target = tokenize(question)
  return examples
    .map((example, index) => ({
      example,
      index,
      score: similarity(target, tokenize(example.question)) + (itemId && example.itemId === itemId ? 0.25 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.example)
}
