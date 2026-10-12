/**
 * Migração de dados v1 → v2 (funções puras, sem acesso a banco).
 *
 * Usado por scripts/v1-para-v2/importar.mjs (importação de teste no Supabase de testes) e base para a migração do
 * cutover. Regras do mapeamento: CEREBRO.md §6.3. Sem imports e só com sintaxe TypeScript "apagável": o Node roda
 * este arquivo direto (type stripping) a partir dos scripts.
 */

/** Textos provisórios que o webhook da v1 grava antes de ler a pergunta no Mercado Livre. */
export const V1_PLACEHOLDER_ITEM_ID = "buscando_item"
export const V1_PLACEHOLDER_QUESTION = "Buscando do Mercado Livre..."
/** Texto que a v1 grava em `ai_response` quando a pergunta já tinha sido respondida fora da plataforma. */
export const V1_ANSWERED_OUTSIDE = "Respondida manualmente pelo vendedor na plataforma."
/** Único modelo usado pela v1 para responder. */
export const V1_AI_MODEL = "gpt-4o-mini"

const EXAMPLE_MAX_LENGTH = 2000
const ITEM_TITLE_MAX_LENGTH = 300
const ERROR_MAX_LENGTH = 500

export type V1QuestionJob = {
  question_id: string
  item_id: string
  seller_id: string
  question_text: string
  status: string
  ai_response: string | null
  error_message: string | null
  item_title: string | null
  item_url: string | null
  created_at: string
  updated_at: string
}

export type V1TrainingExample = {
  question_id: string
  item_id: string
  question_text: string
  answer_text: string
  created_at: string
}

export type V2Target = { organizationId: string; mlAccountId: string }

export type MapOptions = {
  /**
   * Trechos do texto padrão que a loja usava na v1 quando a IA não tinha a informação (ex.: o modelo "Regra 0.4").
   * Respostas com um desses trechos viram "mensagem padrão" na v2 (violeta, filtro próprio, "onde a IA pode melhorar").
   */
  fallbackMarkers?: string[]
}

export type V2QuestionStatus = "answered" | "answered_outside" | "needs_review" | "ignored"

export type V2QuestionRow = {
  organization_id: string
  ml_account_id: string
  ml_question_id: number
  item_id: string | null
  item_title: string | null
  item_permalink: string | null
  question_text: string
  question_created_at: string
  status: V2QuestionStatus
  review_reason: "processing_error" | "auto_reply_off" | null
  answer_text: string | null
  answer_source: "ai" | "external" | null
  answered_at: string | null
  ai_model: string | null
  /** "ai_escalated" quando a resposta enviada pela v1 foi o texto padrão de "não tenho essa informação". */
  fallback_reason: "ai_escalated" | null
  attempts: number
  next_attempt_at: string
  last_error: string | null
  created_at: string
  updated_at: string
}

export type V2ExampleRow = {
  organization_id: string
  ml_account_id: string
  item_id: string | null
  item_title: string | null
  question_text: string
  answer_text: string
  created_at: string
  updated_at: string
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").trim()
}

function isItemId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Z]{3}[0-9]{6,15}$/.test(value)
}

/** A v1 não chegou a ler a pergunta no Mercado Livre (só existe o código da pergunta). */
export function isPlaceholderJob(job: Pick<V1QuestionJob, "item_id" | "question_text">): boolean {
  return job.item_id === V1_PLACEHOLDER_ITEM_ID || clean(job.question_text) === V1_PLACEHOLDER_QUESTION
}

function v1Error(message: string): string {
  return `Importada da v1: ${message}`.slice(0, ERROR_MAX_LENGTH)
}

/**
 * Converte uma linha de `question_jobs` (v1) em `ml_questions` (v2).
 * - done + resposta da IA → answered (fonte "ai", modelo gpt-4o-mini; respondida em = updated_at da v1)
 * - done com o aviso de resposta manual, ou erro "is not unanswered" → answered_outside (texto e data desconhecidos)
 * - error / processing / pending → needs_review (processing_error) com o motivo da v1 — a v1 não respondeu
 * - manual (rota antiga, robô pausado) → needs_review (auto_reply_off)
 * - pergunta que a v1 nunca leu (texto provisório) → ignored (arquivada), sem texto nem anúncio
 * - resposta com um trecho de `fallbackMarkers` → answered com fallback_reason "ai_escalated" (mensagem padrão)
 * Nenhuma linha importada entra na fila de processamento da v2.
 */
export function mapQuestionJob(job: V1QuestionJob, target: V2Target, options: MapOptions = {}): V2QuestionRow {
  if (!/^[0-9]{1,18}$/.test(job.question_id)) {
    throw new Error(`question_id inválido na v1: ${job.question_id}`)
  }
  const placeholder = isPlaceholderJob(job)
  const answer = clean(job.ai_response)
  const errorMessage = clean(job.error_message)

  const row: V2QuestionRow = {
    organization_id: target.organizationId,
    ml_account_id: target.mlAccountId,
    ml_question_id: Number(job.question_id),
    item_id: !placeholder && isItemId(job.item_id) ? job.item_id : null,
    item_title: placeholder ? null : clean(job.item_title) || null,
    item_permalink: placeholder ? null : clean(job.item_url) || null,
    question_text: placeholder ? "" : clean(job.question_text),
    question_created_at: job.created_at,
    status: "needs_review",
    review_reason: null,
    answer_text: null,
    answer_source: null,
    answered_at: null,
    ai_model: null,
    fallback_reason: null,
    attempts: 0,
    next_attempt_at: job.created_at,
    last_error: null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }

  // A v1 não sabe quando (nem o quê) o vendedor respondeu fora: answered_at fica vazio para não entrar no
  // "tempo de resposta de você" de Resultados com um número falso.
  const answeredOutside = (): V2QuestionRow => ({
    ...row,
    status: "answered_outside",
    answer_source: "external",
  })

  if (job.status === "done") {
    if (!answer || answer === V1_ANSWERED_OUTSIDE) return answeredOutside()
    const normalized = answer.toLowerCase()
    const isFallback = (options.fallbackMarkers ?? []).some(
      (marker) => marker.trim() && normalized.includes(marker.trim().toLowerCase())
    )
    return {
      ...row,
      status: "answered",
      answer_text: answer,
      answer_source: "ai",
      answered_at: job.updated_at,
      ai_model: V1_AI_MODEL,
      fallback_reason: isFallback ? "ai_escalated" : null,
    }
  }

  if (job.status === "error" && /is not unanswered/i.test(errorMessage)) return answeredOutside()

  const reason =
    job.status === "error"
      ? errorMessage || "erro sem detalhes"
      : job.status === "manual"
        ? "respostas automáticas pausadas (não respondida pela IA)"
        : "a v1 não terminou de processar esta pergunta"

  if (placeholder) {
    return { ...row, status: "ignored", last_error: v1Error(`a v1 não chegou a ler esta pergunta no Mercado Livre (${reason})`) }
  }
  return {
    ...row,
    status: "needs_review",
    review_reason: job.status === "manual" ? "auto_reply_off" : "processing_error",
    attempts: job.status === "manual" ? 0 : 5,
    last_error: v1Error(reason),
  }
}

/** Título mais recente de cada anúncio, a partir das perguntas da v1 (a v1 não guarda título nos exemplos). */
export function itemTitlesFromJobs(jobs: V1QuestionJob[]): Map<string, string> {
  const titles = new Map<string, string>()
  const ordered = [...jobs].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const job of ordered) {
    const title = clean(job.item_title)
    if (isItemId(job.item_id) && title) titles.set(job.item_id, title.slice(0, ITEM_TITLE_MAX_LENGTH))
  }
  return titles
}

/**
 * Converte os exemplos de treino da v1 (respostas reais do vendedor sincronizadas do ML) em respostas ensinadas
 * da v2. Mantém o anúncio de origem (na v2 a resposta passa a valer para aquele anúncio), descarta textos vazios ou
 * maiores que o limite e remove repetidos (mesma pergunta, resposta e anúncio).
 */
export function mapTrainingExamples(
  examples: V1TrainingExample[],
  target: V2Target,
  titles: Map<string, string> = new Map()
): { rows: V2ExampleRow[]; skipped: number } {
  const rows: V2ExampleRow[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const example of examples) {
    const question = clean(example.question_text)
    const answer = clean(example.answer_text)
    if (!question || !answer || question.length > EXAMPLE_MAX_LENGTH || answer.length > EXAMPLE_MAX_LENGTH) {
      skipped++
      continue
    }
    const itemId = isItemId(example.item_id) ? example.item_id : null
    const key = `${itemId ?? ""}\u0000${question.toLowerCase()}\u0000${answer.toLowerCase()}`
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    rows.push({
      organization_id: target.organizationId,
      ml_account_id: target.mlAccountId,
      item_id: itemId,
      item_title: itemId ? (titles.get(itemId) ?? null) : null,
      question_text: question,
      answer_text: answer,
      created_at: example.created_at,
      updated_at: example.created_at,
    })
  }
  return { rows, skipped }
}

/** Contagem por status (resumo da importação). */
export function countByStatus(rows: Pick<V2QuestionRow, "status">[]): Record<V2QuestionStatus, number> {
  const counts: Record<V2QuestionStatus, number> = { answered: 0, answered_outside: 0, needs_review: 0, ignored: 0 }
  for (const row of rows) counts[row.status]++
  return counts
}

/**
 * CNPJ fictício e válido (dígitos verificadores corretos) para preencher os dados de cobrança de uma conta de
 * teste. Determinístico a partir de uma semente. Só para o Supabase de TESTES.
 */
export function fictitiousCnpj(seed: string): string {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  const base = `${String(hash % 100_000_000).padStart(8, "0")}0001`
  const digit = (numbers: string, weights: number[]) => {
    const sum = [...numbers].reduce((total, char, index) => total + Number(char) * weights[index], 0)
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }
  const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = digit(`${base}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${first}${second}`
}


