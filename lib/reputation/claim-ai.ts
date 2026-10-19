import { containsExternalContact } from "@/lib/answers/compose"
import {
  CLAIM_ACTION_LABELS,
  CLAIM_STAGE_LABELS,
  EXPECTED_RESOLUTION_LABELS,
  ROLE_LABELS,
  claimMessageText,
  claimTypeLabel,
  reasonGroup,
  type ClaimActionKind,
  type OrderSummary,
} from "@/lib/reputation/claim-details"
import { EXCLUSION_CASE_IDS, EXCLUSION_CASES, NOT_EXCLUDABLE, type ExclusionCaseId } from "@/lib/reputation/exclusions"

/**
 * Análise de reclamação pela IA (puro, testado em tests/unit/reputation-claims.test.ts): prompt, formato da resposta
 * (JSON Schema) e validação. A IA só prepara: o vendedor lê, edita e decide; nada é enviado sozinho.
 */

export const CLAIM_BEST_ACTIONS = ["reply", "refund", "partial_refund", "allow_return", "open_dispute", "send_evidence", "wait"] as const
export type ClaimBestAction = (typeof CLAIM_BEST_ACTIONS)[number]

export const CLAIM_RISKS = ["low", "medium", "high"] as const
export type ClaimRisk = (typeof CLAIM_RISKS)[number]

export const BEST_ACTION_LABELS: Record<ClaimBestAction, string> = {
  reply: "Responder",
  refund: "Devolver o dinheiro",
  partial_refund: "Oferecer reembolso parcial",
  allow_return: "Aceitar a devolução",
  open_dispute: "Pedir a mediação do ML",
  send_evidence: "Enviar comprovante",
  wait: "Aguardar",
}

export const RISK_LABELS: Record<ClaimRisk, string> = { low: "Risco baixo", medium: "Risco médio", high: "Risco alto" }

export type ClaimAnalysis = {
  summary: string
  risk: ClaimRisk
  bestAction: ClaimBestAction
  bestActionReason: string
  buyerDraft: string
  mediatorDraft: string
  exclusionCase: ExclusionCaseId | "none"
  exclusionConfidence: ClaimRisk
  exclusionText: string
}

export const CLAIM_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    risk: { type: "string", enum: [...CLAIM_RISKS] },
    best_action: { type: "string", enum: [...CLAIM_BEST_ACTIONS] },
    best_action_reason: { type: "string" },
    buyer_draft: { type: "string" },
    mediator_draft: { type: "string" },
    exclusion_case: { type: "string", enum: [...EXCLUSION_CASE_IDS, "none"] },
    exclusion_confidence: { type: "string", enum: [...CLAIM_RISKS] },
    exclusion_text: { type: "string" },
  },
  required: [
    "summary",
    "risk",
    "best_action",
    "best_action_reason",
    "buyer_draft",
    "mediator_draft",
    "exclusion_case",
    "exclusion_confidence",
    "exclusion_text",
  ],
} as const

export type ClaimPromptInput = {
  storeName: string
  claim: {
    type: string
    stage: string | null
    status: string
    reasonId: string | null
    reasonDetail: string | null
    problem: string | null
    title: string | null
    description: string | null
    createdAt: string | null
    dueDate: string | null
    fulfilled: boolean | null
    affects: string | null
    hasIncentive: boolean | null
  }
  sale: OrderSummary | null
  shipping: { status: string | null; substatus: string | null; tracking_number: string | null } | null
  expected: { player_role: string | null; expected_resolution: string; status: string | null }[]
  messages: { sender_role: string | null; message: string; message_at: string | null }[]
  actions: ClaimActionKind[]
  onlyInMl: string[]
}

/** Limites dos textos (o ML aceita mensagens longas na reclamação; a maanu limita a 2.000 caracteres). */
const LIMITS = { summary: 600, reason: 500, draft: 2000, exclusion: 1500 }
const MAX_MESSAGES = 30
const MESSAGE_CHARS = 1200

export function buildClaimSystemPrompt(storeName: string): string {
  const cases = EXCLUSION_CASES.map((item) => "- " + item.id + ": " + item.label).join("\n")
  const notExcludable = NOT_EXCLUDABLE.map((item) => "- " + item).join("\n")
  return [
    "Você é o assistente de reclamações da maanu para a loja \"" + storeName + "\", vendedora no Mercado Livre (Brasil).",
    "Seu trabalho: ler a reclamação e preparar a melhor saída para resolver o problema do comprador e proteger a reputação e o dinheiro do vendedor, sempre com honestidade.",
    "Você NÃO envia nada: o vendedor lê, edita e decide. Mesmo assim, escreva como se fosse enviado.",
    "",
    "Regras dos textos:",
    "- Português do Brasil, cordial, objetivo e sem jargão. Até " + LIMITS.draft + " caracteres.",
    "- Nunca invente fatos (prazos, rastreio, estado do produto, políticas da loja). Use só o que está nos dados. Se faltar uma informação, escreva entre colchetes para o vendedor completar, ex.: [número do rastreio].",
    "- Nunca prometa reembolso, troca ou prazo que o vendedor não decidiu: proponha a solução como opção.",
    "- Proibido contato fora do Mercado Livre: nada de telefone, WhatsApp, e-mail, links ou redes sociais.",
    "- Não culpe nem acuse o comprador. Não cite a reputação do vendedor para o comprador.",
    "- buyer_draft: mensagem para o comprador, só se o vendedor puder responder a ele (ação \"Responder ao comprador\" disponível); senão, vazio.",
    "- mediator_draft: mensagem para o mediador do ML com os fatos e o pedido do vendedor, só se a reclamação estiver em mediação ou se pedir mediação for a melhor saída; senão, vazio.",
    "",
    "Melhor saída (best_action): reply, refund, partial_refund, allow_return, open_dispute, send_evidence (comprovante de envio, que o vendedor faz no ML) ou wait.",
    "Prefira uma ação que o ML liberou para o vendedor (lista \"Ações disponíveis\"). Reembolso total só quando for claramente o mais barato e justo; em defeito ou produto diferente, devolução ou reembolso parcial costumam ser melhores; em não recebido com envio no prazo, responder com o rastreio e aguardar.",
    "",
    "Exclusão da reputação (exclusion_case): o ML analisa e pode tirar da conta reclamações destes casos:",
    cases,
    "Estes o ML NÃO analisa (use \"none\"):",
    notExcludable,
    "Escolha um caso só se os dados mostrarem que ele se aplica; na dúvida, \"none\". exclusion_confidence: o quanto os dados sustentam o caso. exclusion_text: pedido curto e factual para o vendedor colar no ML (vazio se \"none\"). Só faz sentido pedir depois de a reclamação ser resolvida.",
    "",
    "summary: 2 a 3 frases sobre o que aconteceu e o que o comprador quer. risk: chance de a reclamação afetar a reputação ou virar mediação desfavorável. best_action_reason: por que essa saída, em 1 a 2 frases.",
  ].join("\n")
}

function line(label: string, value: string | null | undefined) {
  return value ? label + ": " + value : null
}

export function buildClaimUserPrompt(input: ClaimPromptInput): string {
  const claim = input.claim
  const sale = input.sale
  const messages = input.messages.slice(-MAX_MESSAGES)
  return [
    "RECLAMAÇÃO",
    line("Tipo", claimTypeLabel(claim.type)),
    line("Etapa", claim.stage ? (CLAIM_STAGE_LABELS[claim.stage] ?? claim.stage) : null),
    line("Situação", claim.status === "opened" ? "aberta" : "encerrada"),
    line("Motivo", [reasonGroup(claim.reasonId), claim.reasonDetail].filter(Boolean).join(" · ") || claim.reasonId),
    line("Problema informado", claim.problem),
    line("Situação descrita pelo ML", [claim.title, claim.description].filter(Boolean).join(" — ")),
    line("Aberta em", claim.createdAt),
    line("Prazo para o vendedor agir", claim.dueDate),
    line("Produto entregue", claim.fulfilled === null ? null : claim.fulfilled ? "sim" : "não"),
    line(
      "Afeta a reputação (segundo o ML)",
      claim.affects === "affected" ? "sim" : claim.affects === "not_affected" ? "não" : claim.affects ? "não se aplica" : "sem informação"
    ),
    claim.hasIncentive ? "Se o vendedor resolver bem nas primeiras 48 horas, a reclamação não afeta a reputação." : null,
    "",
    "O QUE CADA PARTE ESPERA",
    ...(input.expected.length
      ? input.expected.map(
          (item) =>
            "- " +
            (ROLE_LABELS[item.player_role ?? ""] ?? item.player_role ?? "?") +
            ": " +
            (EXPECTED_RESOLUTION_LABELS[item.expected_resolution] ?? item.expected_resolution) +
            (item.status ? " (" + item.status + ")" : "")
        )
      : ["(sem informação)"]),
    "",
    "VENDA",
    sale
      ? [
          line("Data", sale.date),
          line("Valor", sale.total_amount === null ? null : (sale.currency_id ?? "BRL") + " " + sale.total_amount.toFixed(2)),
          ...sale.items.map((item) => "- " + item.quantity + "x " + item.title),
        ]
          .filter(Boolean)
          .join("\n")
      : "(sem informação)",
    "",
    "ENVIO",
    input.shipping
      ? [line("Situação", input.shipping.status), line("Detalhe", input.shipping.substatus), line("Rastreio", input.shipping.tracking_number)]
          .filter(Boolean)
          .join("\n") || "(sem informação)"
      : "(sem informação)",
    "",
    "MENSAGENS (da mais antiga para a mais nova)",
    ...(messages.length
      ? messages.map(
          (message) =>
            "[" +
            (ROLE_LABELS[message.sender_role ?? ""] ?? message.sender_role ?? "?") +
            (message.message_at ? " · " + message.message_at : "") +
            "] " +
            claimMessageText(message.message).replace(/\s+/g, " ").slice(0, MESSAGE_CHARS)
        )
      : ["(nenhuma mensagem)"]),
    "",
    "AÇÕES DISPONÍVEIS PARA O VENDEDOR NA MAANU",
    input.actions.length ? input.actions.map((kind) => "- " + CLAIM_ACTION_LABELS[kind]).join("\n") : "(nenhuma)",
    input.onlyInMl.length ? "Só no Mercado Livre: " + input.onlyInMl.join(", ") : null,
  ]
    .filter((item) => item !== null)
    .join("\n")
}

export function buildClaimMessages(input: ClaimPromptInput) {
  return [
    { role: "system" as const, content: buildClaimSystemPrompt(input.storeName) },
    { role: "user" as const, content: buildClaimUserPrompt(input) },
  ]
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max - 1).trimEnd() + "…" : trimmed
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Rascunho com contato externo (proibido pelo ML) é descartado. */
function safeDraft(value: unknown): string {
  const draft = clean(value, LIMITS.draft)
  return draft && containsExternalContact(draft) ? "" : draft
}

/** Valida a resposta da IA. Campos inválidos viram valores seguros; nada lança erro. */
export function normalizeClaimAnalysis(raw: unknown): ClaimAnalysis {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const exclusionCase = oneOf<ExclusionCaseId | "none">(data.exclusion_case, [...EXCLUSION_CASE_IDS, "none"], "none")
  return {
    summary: clean(data.summary, LIMITS.summary),
    risk: oneOf(data.risk, CLAIM_RISKS, "medium"),
    bestAction: oneOf(data.best_action, CLAIM_BEST_ACTIONS, "reply"),
    bestActionReason: clean(data.best_action_reason, LIMITS.reason),
    buyerDraft: safeDraft(data.buyer_draft),
    mediatorDraft: safeDraft(data.mediator_draft),
    exclusionCase,
    exclusionConfidence: exclusionCase === "none" ? "low" : oneOf(data.exclusion_confidence, CLAIM_RISKS, "low"),
    exclusionText: exclusionCase === "none" ? "" : safeDraft(data.exclusion_text).slice(0, LIMITS.exclusion),
  }
}

/** Lê uma análise gravada (ai_result) de volta. */
export function readClaimAnalysis(stored: unknown): ClaimAnalysis | null {
  if (!stored || typeof stored !== "object") return null
  const data = stored as Record<string, unknown>
  if (typeof data.summary !== "string") return null
  return normalizeClaimAnalysis({
    summary: data.summary,
    risk: data.risk,
    best_action: data.bestAction,
    best_action_reason: data.bestActionReason,
    buyer_draft: data.buyerDraft,
    mediator_draft: data.mediatorDraft,
    exclusion_case: data.exclusionCase,
    exclusion_confidence: data.exclusionConfidence,
    exclusion_text: data.exclusionText,
  })
}

/** Possível exclusão para avisar no app: a IA achou um caso com certeza média ou alta. */
export function suggestsExclusion(analysis: ClaimAnalysis | null): boolean {
  return Boolean(analysis && analysis.exclusionCase !== "none" && analysis.exclusionConfidence !== "low")
}
