import { containsExternalContact } from "@/lib/answers/compose"
import {
  CONDITION_LABELS,
  WAREHOUSE_REASON_LABELS,
  appealStrength,
  buyerReasonKind,
  ownReviews,
  triageAwaitingSeller,
  type FindingConfidence,
  type ReturnReview,
  type ReviewMode,
} from "@/lib/recovery/returns"

/**
 * "Sugerir ação" do Recuperador (puro, testado em tests/unit/recovery-ai.test.ts): uma recomendação curta — contestar,
 * não contestar ou pedir ressarcimento parcial — a partir do motivo do comprador, do que o armazém do ML registrou, do
 * dinheiro e da reputação. As regras (suggestActionByRules) sempre produzem uma resposta; a IA (suggest-model.ts) só
 * refina o texto e pode divergir das regras com a confiança limitada. A sugestão NUNCA envia nada ao Mercado Livre:
 * o dono decide e confirma no fluxo de revisão.
 *
 * Significado por modo (ReviewMode):
 *  - appeal (o armazém do ML tirou o produto de venda): contest = contestar a revisão; do_not_contest = deixar passar;
 *    partial_refund = contestar pedindo só o que foi perdido (embalagem, peça ou unidades que faltaram).
 *  - arrival (o pacote chegou ao vendedor): contest = relatar problema ao ML; do_not_contest = confirmar que chegou
 *    certinho (se estiver mesmo); partial_refund = relatar a devolução incompleta e pedir o proporcional. Nesse modo a
 *    decisão depende do que o dono VÊ no pacote (needsInspection = true).
 */

export const SUGGESTED_ACTIONS = ["contest", "do_not_contest", "partial_refund"] as const
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number]
export type SuggestionConfidence = FindingConfidence
export type SuggestionSource = "ai" | "rules"

/** Tamanho máximo do motivo mostrado no card (o card é curto de propósito). */
export const SUGGESTION_REASON_MAX = 260

export type ReturnSuggestion = {
  action: SuggestedAction
  /** Motivo curto em PT-BR, na segunda pessoa ("você"). */
  reason: string
  confidence: SuggestionConfidence
  /** ai = refinada pelo modelo; rules = regras determinísticas (também é o plano B quando a IA falha ou está pausada). */
  source: SuggestionSource
  /** O dono precisa conferir o pacote antes de decidir (modo arrival). */
  needsInspection: boolean
  /** Fatos usados, curtos e em PT-BR (sempre das regras: a IA não acrescenta fatos). */
  signals: string[]
}

/** Rótulo da ação para a tela, conforme o modo. */
export const SUGGESTION_LABELS: Record<SuggestedAction, Record<ReviewMode, string>> = {
  contest: { arrival: "Relatar o problema ao ML", appeal: "Contestar a revisão do armazém" },
  do_not_contest: { arrival: "Confirmar que chegou certinho", appeal: "Não contestar" },
  partial_refund: { arrival: "Pedir ressarcimento parcial", appeal: "Pedir ressarcimento parcial" },
}

export function suggestionLabel(action: SuggestedAction, mode: ReviewMode): string {
  return SUGGESTION_LABELS[action][mode]
}

export const CONFIDENCE_LABELS: Record<SuggestionConfidence, string> = {
  high: "Confiança alta",
  medium: "Confiança média",
  low: "Confiança baixa",
}

export type SuggestWarehouse = {
  condition: string | null
  reasonId: string | null
  destination: string | null
  benefited: string | null
  sellerStatus: string | null
}

export type SuggestInput = {
  mode: ReviewMode
  /** Motivo que o comprador declarou (texto do ML). */
  buyerReason: string | null
  /** Revisão do armazém do ML deste pedido (a que espera o vendedor, senão a mais recente). */
  warehouse: SuggestWarehouse | null
  statusMoney: string | null
  amount: number | null
  currencyId: string | null
  deadlineAt: string | null
  deadlineEstimated: boolean
  /** affected = a reclamação conta contra a reputação do vendedor. */
  affectsReputation: "affected" | "not_affected" | null
  isCart: boolean
  /** Voltaram menos unidades do que foram vendidas. */
  partialReturn: boolean
  canOk: boolean
  canFail: boolean
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

function money(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "BRL" }).format(value)
  } catch {
    return "R$ " + value.toFixed(2)
  }
}

const STATUS_MONEY_SIGNALS: Record<string, string> = {
  retained: "O dinheiro da venda ainda está retido no Mercado Pago.",
  refunded: "O dinheiro já foi devolvido ao comprador.",
  available: "O dinheiro está liberado para você.",
}

/** Fatos curtos que justificam a sugestão (mostrados no card; a IA usa os mesmos). */
export function suggestionSignals(input: SuggestInput, now: Date = new Date()): string[] {
  const signals: string[] = []
  if (input.buyerReason?.trim()) signals.push("Comprador: “" + clip(input.buyerReason, 90) + "”")
  const warehouse = input.warehouse
  if (warehouse) {
    const condition = warehouse.condition ? (CONDITION_LABELS[warehouse.condition] ?? warehouse.condition) : null
    const reason = warehouse.reasonId ? (WAREHOUSE_REASON_LABELS[warehouse.reasonId] ?? warehouse.reasonId) : null
    if (condition || reason) {
      signals.push("Armazém do ML: produto " + [condition, reason ? "(" + reason + ")" : null].filter(Boolean).join(" "))
    }
  }
  if (input.statusMoney && STATUS_MONEY_SIGNALS[input.statusMoney]) signals.push(STATUS_MONEY_SIGNALS[input.statusMoney])
  if (input.amount) signals.push("Valor em jogo: " + money(input.amount, input.currencyId))
  if (input.affectsReputation === "affected") signals.push("Esta reclamação afeta a sua reputação.")
  if (input.affectsReputation === "not_affected") signals.push("Esta reclamação não afeta a sua reputação.")
  if (input.partialReturn) signals.push("Voltaram menos unidades do que foram vendidas.")
  if (input.isCart) signals.push("Devolução de carrinho com vários pedidos.")
  if (input.deadlineAt) {
    const left = Date.parse(input.deadlineAt) - now.getTime()
    if (Number.isFinite(left)) {
      signals.push(
        left <= 0
          ? "O prazo " + (input.deadlineEstimated ? "estimado " : "") + "já passou."
          : "Faltam " + (left < 36 * 3600_000 ? Math.max(1, Math.round(left / 3600_000)) + " h" : Math.round(left / 86_400_000) + " dias") + " para o prazo" + (input.deadlineEstimated ? " (estimado)" : "") + "."
      )
    }
  }
  return signals
}

const PARTIAL_APPEAL_REASONS = new Set(["other_attribute", "open_box"])

function base(action: SuggestedAction, reason: string, confidence: SuggestionConfidence, input: SuggestInput, now: Date): ReturnSuggestion {
  return {
    action,
    reason: clip(reason, SUGGESTION_REASON_MAX),
    confidence,
    source: "rules",
    needsInspection: input.mode === "arrival",
    signals: suggestionSignals(input, now),
  }
}

/** Garante que a sugestão é possível agora (o ML só aceita relatar problema se a ação estiver liberada). */
export function sanitizeSuggestion(suggestion: ReturnSuggestion, input: SuggestInput): ReturnSuggestion {
  if (input.mode === "arrival" && !input.canOk && suggestion.action === "do_not_contest") {
    return {
      ...suggestion,
      reason: "Confira o pacote. Aqui o Mercado Livre só aceita o relato de problema; se o produto está como você enviou, revise pelo app do ML.",
    }
  }
  if (suggestion.action !== "do_not_contest" && !input.canFail) {
    return {
      ...suggestion,
      action: "do_not_contest",
      confidence: "low",
      reason: "O Mercado Livre não está aceitando o relato de problema agora. Atualize a devolução ou revise pelo app do ML.",
    }
  }
  return suggestion
}

/**
 * Sugestão por regras (determinística; também é o plano B quando a IA falha, está pausada ou devolve algo inválido).
 */
export function suggestActionByRules(input: SuggestInput, now: Date = new Date()): ReturnSuggestion {
  const kind = buyerReasonKind(input.buyerReason)
  const warehouseReason = input.warehouse?.reasonId ?? null

  if (input.mode === "appeal") {
    const strength = appealStrength(input.buyerReason, warehouseReason)
    if (strength === "high") {
      return sanitizeSuggestion(
        base(
          "contest",
          "O comprador disse que o produto estava bem (ou se arrependeu) e o armazém achou dano, uso, troca ou falta. Se ele saiu perfeito daqui, vale contestar com fotos do envio e do que voltou.",
          "high",
          input,
          now
        ),
        input
      )
    }
    if (strength === "low") {
      return sanitizeSuggestion(
        base(
          "do_not_contest",
          kind === "problem"
            ? "O comprador já tinha reclamado de defeito e o armazém confirmou o problema; o ML costuma não ressarcir nesse caso. Só conteste se tiver prova de que o produto saiu perfeito."
            : "O armazém apontou defeito de funcionamento, o mesmo tipo de falha que o comprador relatou; o ML costuma não ressarcir nesse caso. Só conteste se tiver prova de que o produto saiu perfeito.",
          "medium",
          input,
          now
        ),
        input
      )
    }
    if (PARTIAL_APPEAL_REASONS.has(warehouseReason ?? "") || input.partialReturn) {
      return sanitizeSuggestion(
        base(
          "partial_refund",
          input.partialReturn
            ? "Voltaram menos unidades do que foram vendidas. Conteste pedindo o ressarcimento do que faltou, com a quantidade enviada e a recebida."
            : "O armazém apontou só a embalagem original (o produto pode estar inteiro). Conteste pedindo o ressarcimento do que foi perdido, não do valor todo.",
          "medium",
          input,
          now
        ),
        input
      )
    }
    return sanitizeSuggestion(
      base(
        "contest",
        "O produto voltou sem condição de venda e o dinheiro ficou com o comprador. Se saiu perfeito do seu estoque, vale contestar; junte fotos do envio e do que voltou.",
        "medium",
        input,
        now
      ),
      input
    )
  }

  // arrival: o pacote chegou e o dono é quem vê o produto.
  if (input.partialReturn) {
    return sanitizeSuggestion(
      base(
        "partial_refund",
        "Voltaram menos unidades do que foram vendidas. Confira o pacote: se faltou mesmo, relate “devolução incompleta” e peça o ressarcimento proporcional.",
        "medium",
        input,
        now
      ),
      input
    )
  }
  if (kind === "regret") {
    return sanitizeSuggestion(
      base(
        "do_not_contest",
        "O comprador se arrependeu, então o produto costuma voltar inteiro. Confira o pacote: se está como você enviou, confirme que chegou certinho; se tem dano, uso ou peça faltando, relate o problema com fotos.",
        "low",
        input,
        now
      ),
      input
    )
  }
  if (kind === "problem") {
    return sanitizeSuggestion(
      base(
        "do_not_contest",
        "O comprador relatou defeito; se o defeito é o mesmo que ele apontou, o ML costuma não ressarcir. Relate problema só se o produto voltou com dano, uso ou peça que você não enviou assim.",
        "low",
        input,
        now
      ),
      input
    )
  }
  return sanitizeSuggestion(
    base(
      "do_not_contest",
      "Não temos o motivo do comprador. Confira o pacote: se está como você enviou, confirme que chegou certinho; se tem dano, uso ou peça faltando, relate o problema com fotos.",
      "low",
      input,
      now
    ),
    input
  )
}

// ---------------------------------------------------------------------------------------------- linha do banco → entrada

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}

/** A revisão do armazém que importa: a que espera o vendedor, senão a mais recente do armazém. */
export function warehouseReviewOf(reviews: readonly ReturnReview[]): ReturnReview | null {
  return triageAwaitingSeller(reviews) ?? reviews.filter((review) => review.method === "triage").at(-1) ?? null
}

/** Monta a entrada da sugestão a partir da linha de recovery_returns e da reclamação (usa só dados já gravados). */
export function suggestInputFromRows(
  row: {
    reviews: unknown
    orders: unknown
    order_id: number | string | null
    status_money: string | null
    amount: number | string | null
    currency_id: string | null
    deadline_at: string | null
    is_cart: boolean
    can_review_ok: boolean
    can_review_fail: boolean
  },
  claim: { reason_detail: string | null; affects_reputation: string | null } | null,
  mode: ReviewMode
): SuggestInput {
  const orderId = row.order_id === null ? null : Number(row.order_id)
  const reviews = ownReviews(Array.isArray(row.reviews) ? (row.reviews as ReturnReview[]) : [], orderId)
  const warehouse = warehouseReviewOf(reviews)
  const orders = (Array.isArray(row.orders) ? row.orders : []) as { order_id?: unknown; return_quantity?: unknown; total_quantity?: unknown }[]
  const own = orders.find((order) => orderId && Number(order?.order_id) === orderId) ?? (orders.length === 1 ? orders[0] : undefined)
  const returned = numberOrNull(own?.return_quantity)
  const sold = numberOrNull(own?.total_quantity)
  return {
    mode,
    buyerReason: claim?.reason_detail?.trim() ? claim.reason_detail.trim().slice(0, 300) : null,
    warehouse: warehouse
      ? {
          condition: warehouse.product_condition,
          reasonId: warehouse.reason_id,
          destination: warehouse.product_destination,
          benefited: warehouse.benefited,
          sellerStatus: warehouse.seller_status,
        }
      : null,
    statusMoney: row.status_money,
    amount: numberOrNull(row.amount),
    currencyId: row.currency_id,
    deadlineAt: row.deadline_at,
    deadlineEstimated: mode === "appeal",
    affectsReputation: claim?.affects_reputation === "affected" ? "affected" : claim?.affects_reputation === "not_affected" ? "not_affected" : null,
    isCart: row.is_cart,
    partialReturn: returned !== null && sold !== null && returned > 0 && returned < sold,
    canOk: row.can_review_ok,
    canFail: row.can_review_fail,
  }
}

// ---------------------------------------------------------------------------------------------- IA (prompt, schema, validação)

export const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: [...SUGGESTED_ACTIONS] },
    reason: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["action", "reason", "confidence"],
} as const

export function buildSuggestionSystemPrompt(storeName: string): string {
  return [
    "Você ajuda a loja \"" + storeName + "\" (vendedora no Mercado Livre Brasil) a decidir o que fazer numa devolução. Você só recomenda: quem decide e envia é o dono da loja.",
    "",
    "Ações possíveis (action):",
    "- contest: contestar a revisão do armazém (modo contestação) ou relatar problema ao ML (modo pacote chegou).",
    "- do_not_contest: não contestar (modo contestação) ou confirmar que o pacote chegou certinho (modo pacote chegou).",
    "- partial_refund: pedir só o ressarcimento do que foi perdido (embalagem, peça ou unidades que faltaram), em vez do valor todo.",
    "",
    "Regras:",
    "- Use SÓ os fatos informados. Nunca invente dano, valor, data, prazo ou o que o ML fará. Fale em probabilidade (\"costuma\", \"pode\"), nunca prometa resultado.",
    "- Português do Brasil, segunda pessoa (\"você\"), até 240 caracteres, uma ou duas frases curtas, sem listas.",
    "- No modo \"pacote chegou\" você não vê o produto: se a decisão depende do estado dele, diga para o dono conferir o pacote.",
    "- Contestar sem base piora o caso e gasta o tempo do vendedor; se o argumento é fraco, recomende não contestar e diga o que mudaria isso.",
    "- Proibido contato fora do Mercado Livre: nada de telefone, WhatsApp, e-mail, links ou redes sociais.",
    "- A sugestão base das regras é um ponto de partida confiável. Só discorde dela se os fatos mostrarem claramente outra coisa e, então, use confiança no máximo \"medium\".",
  ].join("\n")
}

export function buildSuggestionUserPrompt(input: SuggestInput, baseline: ReturnSuggestion, itemTitle: string | null): string {
  const warehouse = input.warehouse
  return [
    "Modo: " + (input.mode === "appeal" ? "contestação (o armazém do ML tirou o produto de venda e devolveu o dinheiro ao comprador)" : "pacote chegou ao vendedor (ele ainda vai conferir)"),
    "Produto: " + (itemTitle?.trim() ? clip(itemTitle, 120) : "(não informado)"),
    "Motivo declarado pelo comprador: " + (input.buyerReason?.trim() ? clip(input.buyerReason, 300) : "(não informado)"),
    "Armazém do ML: " +
      (warehouse
        ? [
            "condição " + (warehouse.condition ? (CONDITION_LABELS[warehouse.condition] ?? warehouse.condition) : "?"),
            "classificação " + (warehouse.reasonId ? (WAREHOUSE_REASON_LABELS[warehouse.reasonId] ?? warehouse.reasonId) : "?"),
            "destino do produto " + (warehouse.destination ?? "?"),
          ].join("; ")
        : "(sem revisão do armazém)"),
    "Dinheiro: " + (input.statusMoney ? (STATUS_MONEY_SIGNALS[input.statusMoney] ?? input.statusMoney) : "(sem informação)"),
    "Valor da venda: " + (input.amount ? money(input.amount, input.currencyId) : "(sem informação)"),
    "Afeta a reputação: " + (input.affectsReputation === "affected" ? "sim" : input.affectsReputation === "not_affected" ? "não" : "(sem informação)"),
    "Devolução parcial (menos unidades que o vendido): " + (input.partialReturn ? "sim" : "não"),
    "Carrinho com vários pedidos: " + (input.isCart ? "sim" : "não"),
    "Prazo: " + (input.deadlineAt ? input.deadlineAt + (input.deadlineEstimated ? " (estimado)" : "") : "(sem informação)"),
    "Frete da devolução: (não disponível)",
    "Ações liberadas pelo ML agora: " + [input.canOk ? "confirmar que chegou certinho" : null, input.canFail ? "relatar problema/contestar" : null].filter(Boolean).join(" e "),
    "",
    "Sugestão base das regras: " + baseline.action + " (confiança " + baseline.confidence + ") — " + baseline.reason,
  ].join("\n")
}

export function buildSuggestionMessages(storeName: string, input: SuggestInput, baseline: ReturnSuggestion, itemTitle: string | null) {
  return [
    { role: "system" as const, content: buildSuggestionSystemPrompt(storeName) },
    { role: "user" as const, content: buildSuggestionUserPrompt(input, baseline, itemTitle) },
  ]
}

const CONFIDENCE_ORDER: Record<SuggestionConfidence, number> = { low: 0, medium: 1, high: 2 }

/**
 * Valida a resposta da IA. Inválida (ação desconhecida, texto vazio, grande demais ou com contato externo) → as regras.
 * Quando a IA diverge das regras, a confiança fica no máximo "medium". Sempre passa por sanitizeSuggestion.
 */
export function normalizeSuggestion(raw: unknown, input: SuggestInput, baseline: ReturnSuggestion, now: Date = new Date()): ReturnSuggestion {
  const data = (raw && typeof raw === "object" ? raw : {}) as { action?: unknown; reason?: unknown; confidence?: unknown }
  const action = SUGGESTED_ACTIONS.find((item) => item === data.action)
  const confidence = (["high", "medium", "low"] as const).find((item) => item === data.confidence)
  const reason = typeof data.reason === "string" ? data.reason.replace(/\s+/g, " ").trim() : ""
  if (!action || !confidence || !reason || reason.length > SUGGESTION_REASON_MAX * 2 || containsExternalContact(reason)) return baseline
  const diverges = action !== baseline.action
  const capped: SuggestionConfidence = diverges && CONFIDENCE_ORDER[confidence] > CONFIDENCE_ORDER.medium ? "medium" : confidence
  return sanitizeSuggestion(
    {
      action,
      reason: clip(reason, SUGGESTION_REASON_MAX),
      confidence: capped,
      source: "ai",
      needsInspection: input.mode === "arrival",
      signals: suggestionSignals(input, now),
    },
    input
  )
}