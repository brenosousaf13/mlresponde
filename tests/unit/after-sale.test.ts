import { describe, expect, it } from "vitest"

import { decideSectionAccess } from "@/lib/access/access"
import {
  BLOCK_REASON_LABELS,
  blockReasonLabel,
  extractPackId,
  isBlockedSendError,
  isRecipientError,
  isTooLongError,
  matchLocalMessage,
  normalizeConversation,
  parseUnreadPacks,
  pendingBuyerMessages,
  postedMessageInfo,
  recipientCandidates,
} from "@/lib/after-sale/conversation"
import { afterSalePresetFor, decideAfterSale, parseSensitivePolicy, parseTopic, type AfterSaleAiResult } from "@/lib/after-sale/decision"
import { parseMessageNotification } from "@/lib/after-sale/notification"
import { buildOrderSnapshot, conversationOrderColumns, parseOrderSnapshot, shippingChip, summarizeOrderForPrompt } from "@/lib/after-sale/order"
import { buildAfterSaleMessages, buildAfterSaleSystemPrompt, formatHistory, type AfterSalePromptInput } from "@/lib/after-sale/prompt"
import {
  conversationHref,
  conversationSearchFilter,
  conversationSummary,
  conversationTone,
  isShippingLate,
  parseConversationTab,
  saleUrl,
} from "@/lib/after-sale/presentation"
import { bodyLimit, composeAfterSaleMessage, normalizeForMatch, toMlMessageText } from "@/lib/after-sale/text"
import { featureAccess, planIncludes, planName, requiredPlanName } from "@/lib/plans/plans"

const SELLER = 415458330
const AGENT_MLB = 3037675074
const BUYER = 266272126

describe("planos", () => {
  it("só o Essencial (e a organização de administração) incluem o pós-venda", () => {
    expect(planIncludes("essencial", "pos_venda")).toBe(true)
    expect(planIncludes(" Essencial ", "pos_venda")).toBe(true)
    expect(planIncludes("admin", "pos_venda")).toBe(true)
    expect(planIncludes(null, "pos_venda")).toBe(false)
    expect(planIncludes("starter", "pos_venda")).toBe(false)
  })

  it("administrador da plataforma vê tudo", () => {
    expect(featureAccess(null, true).pos_venda).toBe(true)
    expect(featureAccess(null, false).pos_venda).toBe(false)
  })

  it("nomes para exibir", () => {
    expect(planName("essencial")).toBe("Essencial")
    expect(planName("pro")).toBe("Pro")
    expect(planName(null)).toBeNull()
    expect(requiredPlanName("pos_venda")).toBe("Essencial")
  })
})

describe("acesso à seção de pós-venda", () => {
  const base = { access: "trial" as const, hasActiveMlAccount: true }

  it("sem o plano: redireciona para a assinatura com o motivo 'plan'", () => {
    expect(decideSectionAccess("pos_venda", { ...base, features: { pos_venda: false } })).toEqual({
      allowed: false,
      redirectTo: "/assinatura?recurso=pos_venda",
      reason: "plan",
    })
    expect(decideSectionAccess("pos_venda", base).allowed).toBe(false)
  })

  it("com o plano: liberado (e as outras seções não mudam)", () => {
    expect(decideSectionAccess("pos_venda", { ...base, features: { pos_venda: true } }).allowed).toBe(true)
    expect(decideSectionAccess("perguntas", { ...base, features: { pos_venda: false } }).allowed).toBe(true)
  })

  it("teste vencido e falta de conta ML continuam valendo", () => {
    expect(decideSectionAccess("pos_venda", { access: "blocked", hasActiveMlAccount: true, features: { pos_venda: true } })).toMatchObject({
      redirectTo: "/assinatura",
    })
    expect(decideSectionAccess("pos_venda", { access: "trial", hasActiveMlAccount: false, features: { pos_venda: true } })).toMatchObject({
      reason: "no_ml_account",
    })
  })

  it("administrador da plataforma passa direto", () => {
    expect(decideSectionAccess("pos_venda", { access: "blocked", hasActiveMlAccount: false, isPlatformAdmin: true }).allowed).toBe(true)
  })
})

describe("texto das mensagens (padrão do ML)", () => {
  it("troca aspas e travessões tipográficos e tira emojis (o ML só aceita latin1)", () => {
    expect(toMlMessageText("“Olá” — tudo certo… 😊 ")).toBe('"Olá" - tudo certo...')
    expect(toMlMessageText("Ação, ç, ã, é, ü, º")).toBe("Ação, ç, ã, é, ü, º")
  })

  it("mantém as quebras de linha e arruma espaços", () => {
    expect(toMlMessageText("  Linha 1  \r\n\r\n\r\n  Linha   2 ")).toBe("Linha 1\n\nLinha 2")
  })

  it("assinatura entra no fim, em uma linha só", () => {
    expect(composeAfterSaleMessage("Olá!\nJá enviamos.", "Equipe Loja")).toBe("Olá! Já enviamos. Equipe Loja")
    expect(composeAfterSaleMessage("Olá!", "")).toBe("Olá!")
  })

  it("limite do corpo desconta a assinatura (com folga)", () => {
    expect(bodyLimit(350, "")).toBe(340)
    expect(bodyLimit(350, "Equipe Loja")).toBe(350 - 12 - 10)
    expect(normalizeForMatch("  Olá,   Tudo ")).toBe("olá, tudo")
  })
})

const message = (id: string, from: number, text: string, created: string, extra: Record<string, unknown> = {}) => ({
  id,
  from: { user_id: from },
  to: { user_id: from === SELLER ? AGENT_MLB : SELLER },
  text,
  status: "available",
  message_date: { created },
  message_moderation: { status: "clean", reason: null },
  message_resources: [
    { id: "2000000089077943", name: "packs" },
    { id: String(SELLER), name: "sellers" },
  ],
  ...extra,
})

describe("conversa do ML", () => {
  const pages = [
    {
      paging: { limit: 2, offset: 0, total: 3 },
      conversation_status: { path: "/packs/2000000089077943/seller/415458330", status: "active", substatus: null, claim_id: null },
      messages: [
        message("b", SELLER, "Já enviamos!", "2026-10-10T12:00:00.000Z"),
        message("a", AGENT_MLB, "Meu pedido já saiu?", "2026-10-10T11:00:00.000Z"),
      ],
      seller_max_message_length: 350,
    },
    { messages: [message("c", AGENT_MLB, "Qual o rastreio?", "2026-10-10T13:00:00.000Z"), message("a", AGENT_MLB, "Meu pedido já saiu?", "2026-10-10T11:00:00.000Z")] },
  ]

  it("junta as páginas em ordem, sem repetir, e identifica quem escreveu", () => {
    const { messages, state } = normalizeConversation(pages, SELLER)
    expect(messages.map((item) => item.mlId)).toEqual(["a", "b", "c"])
    expect(messages.map((item) => item.sender)).toEqual(["buyer", "seller", "buyer"])
    expect(state).toMatchObject({ blocked: false, claimOpen: false, maxLength: 350 })
  })

  it("conversa bloqueada e mediação", () => {
    const { state } = normalizeConversation(
      [{ conversation_status: { status: "blocked", substatus: "blocked_by_mediation" }, messages: [] }],
      SELLER
    )
    expect(state).toMatchObject({ blocked: true, substatus: "blocked_by_mediation", claimOpen: true })
    expect(normalizeConversation([{ conversation_status: { status: "active", claim_ids: [123] } }], SELLER).state.claimOpen).toBe(true)
  })

  it("lê o formato antigo (text.plain, date) e ignora mensagens sem id ou data", () => {
    const { messages } = normalizeConversation(
      [{ messages: [{ message_id: "x1", from: { user_id: BUYER }, text: { plain: "Oi" }, date: "2026-10-01T10:00:00Z" }, { from: { user_id: 1 } }] }],
      SELLER
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ mlId: "x1", sender: "buyer", text: "Oi" })
  })

  it("lê anexos", () => {
    const { messages } = normalizeConversation(
      [{ messages: [message("f", AGENT_MLB, "", "2026-10-10T10:00:00Z", { message_attachments: [{ filename: "123_abc.jpg", original_filename: "foto.jpg", type: "image/jpeg", size: 10 }] })] }],
      SELLER
    )
    expect(messages[0].attachments).toEqual([{ id: "123_abc.jpg", name: "foto.jpg", type: "image/jpeg", size: 10 }])
  })

  it("mensagens esperando resposta: depois da última resposta que chegou ao comprador", () => {
    const rows = [
      { sender: "buyer", id: 1 },
      { sender: "seller", id: 2 },
      { sender: "buyer", id: 3 },
      { sender: "seller", id: 4, ml_status: "rejected" },
      { sender: "buyer", id: 5 },
    ]
    expect(pendingBuyerMessages(rows).map((row) => row.id)).toEqual([3, 5])
    expect(pendingBuyerMessages([{ sender: "buyer" }, { sender: "seller" }])).toEqual([])
  })

  it("descobre a venda da mensagem (formato novo e antigo)", () => {
    expect(extractPackId({ messages: [message("a", AGENT_MLB, "x", "2026-10-10T10:00:00Z")] })).toBe("2000000089077943")
    expect(extractPackId({ message_resources: [{ id: 99887766, name: "orders" }] })).toBe("99887766")
    expect(extractPackId({ resource: "orders", resource_id: "1234567871" })).toBe("1234567871")
    expect(extractPackId({ resource: "orders", resource_id: "abc" })).toBeNull()
    expect(extractPackId(null)).toBeNull()
  })

  it("lista as vendas com mensagens não lidas", () => {
    expect(
      parseUnreadPacks({ results: [{ resource: "/packs/1234/sellers/2345", count: 1 }, { resource: "/orders/999/sellers/2345" }, { resource: "lixo" }] })
    ).toEqual(["1234", "999"])
    expect(parseUnreadPacks({ results: [] })).toEqual([])
  })
})

describe("destinatário e erros de envio", () => {
  it("Brasil: agente de mensageria primeiro, comprador como segunda tentativa", () => {
    expect(recipientCandidates({ siteId: "MLB", conversationPath: null, messages: [], buyerId: BUYER, sellerId: SELLER })).toEqual([AGENT_MLB, BUYER])
  })

  it("outros sites: comprador primeiro, a não ser que a conversa passe pelo agente", () => {
    expect(recipientCandidates({ siteId: "MLA", conversationPath: "/packs/1/seller/2", messages: [], buyerId: BUYER, sellerId: SELLER })).toEqual([
      BUYER,
      3037674934,
    ])
    expect(
      recipientCandidates({ siteId: "MLA", conversationPath: "/packs/1/sellers/2/conversations/claim", messages: [], buyerId: BUYER, sellerId: SELLER })[0]
    ).toBe(3037674934)
  })

  it("nunca manda para o próprio vendedor e sem comprador usa só o agente", () => {
    expect(recipientCandidates({ siteId: "MLB", conversationPath: null, messages: [], buyerId: null, sellerId: SELLER })).toEqual([AGENT_MLB])
  })

  it("classifica as recusas do ML", () => {
    expect(isRecipientError(403, "Mercado Livre: Receiver does not belong to order 123")).toBe(true)
    expect(isRecipientError(400, "Mercado Livre: Invalid 'to' user id")).toBe(true)
    expect(isBlockedSendError(403, "Mercado Livre: blocked_conversation_send_message_forbidden")).toBe(true)
    expect(isBlockedSendError(403, "Mercado Livre: You can not send the message because a mediation is in process")).toBe(true)
    expect(isTooLongError(400, "Mercado Livre: The message content is too long, max characters allowed are 350")).toBe(true)
    expect(isTooLongError(500, "too long")).toBe(false)
  })

  it("lê o id da mensagem criada e liga a mensagem local à do ML", () => {
    expect(postedMessageInfo({ id: "abc", status: "available" })).toEqual({ id: "abc", status: "available" })
    expect(postedMessageInfo({ messages: [{ id: "def", status: "pending_review" }] })).toEqual({ id: "def", status: "pending_review" })
    expect(postedMessageInfo(null)).toEqual({ id: null, status: null })
    const locals = [{ text: "Já enviamos!  Equipe", sent_at: "2026-10-10T12:00:05Z" }]
    expect(matchLocalMessage(locals, { text: "Já enviamos! Equipe", sentAt: "2026-10-10T12:00:00Z" })).toBe(locals[0])
    expect(matchLocalMessage(locals, { text: "Outra", sentAt: "2026-10-10T12:00:00Z" })).toBeNull()
    expect(matchLocalMessage(locals, { text: "Já enviamos! Equipe", sentAt: "2026-10-12T12:00:00Z" })).toBeNull()
  })

  it("explica por que o ML fechou a conversa", () => {
    expect(blockReasonLabel("blocked_by_buyer")).toBe(BLOCK_REASON_LABELS.blocked_by_buyer)
    expect(blockReasonLabel("algo_novo")).toContain("fechou esta conversa")
    expect(blockReasonLabel(null)).toContain("fechou esta conversa")
  })
})

describe("notificação do tópico messages", () => {
  const body = { resource: "3f6da1e35ac84f70a24af7360d24c7bc", user_id: 123456789, topic: "messages", actions: ["created"], application_id: 777 }

  it("aceita mensagem nova do nosso app", () => {
    expect(parseMessageNotification(body, "777")).toEqual({ mlUserId: 123456789, messageId: "3f6da1e35ac84f70a24af7360d24c7bc" })
    expect(parseMessageNotification({ ...body, resource: "/messages/abcdef123" }, "777")?.messageId).toBe("abcdef123")
    expect(parseMessageNotification({ ...body, actions: undefined }, "777")).not.toBeNull()
  })

  it("ignora leitura, outro app, outro tópico e dados inválidos", () => {
    expect(parseMessageNotification({ ...body, actions: ["read"] }, "777")).toBeNull()
    expect(parseMessageNotification(body, "888")).toBeNull()
    expect(parseMessageNotification({ ...body, topic: "questions" }, "777")).toBeNull()
    expect(parseMessageNotification({ ...body, resource: "../../x" }, "777")).toBeNull()
    expect(parseMessageNotification({ ...body, user_id: "abc" }, "777")).toBeNull()
  })
})

const order = {
  id: 2000003508897196,
  status: "paid",
  date_created: "2026-10-01T17:01:30.000-03:00",
  pack_id: 2000003508553677,
  total_amount: 100,
  currency_id: "BRL",
  order_items: [
    {
      item: { id: "MLB2608564035", title: "Camiseta Basica", variation_attributes: [{ name: "Tamanho", value_name: "M" }, { name: "Cor", value_name: "Preto" }] },
      quantity: 2,
      unit_price: 50,
    },
  ],
  payments: [{ status: "approved" }],
  shipping: { id: 41297142475 },
  buyer: { id: BUYER },
  tags: ["paid", "not_delivered"],
}

const shipment = {
  id: 41297142475,
  status: "shipped",
  substatus: "in_transit",
  tracking_number: "AA123456789BR",
  tracking_method: "Correios",
  logistic: { mode: "me2", type: "drop_off" },
  lead_time: { estimated_delivery_limit: { date: "2026-10-05T23:59:59-03:00" }, shipping_method: { name: "Normal" } },
  status_history: { date_shipped: "2026-10-02T10:00:00-03:00" },
}

describe("venda e envio", () => {
  const snapshot = buildOrderSnapshot([order], shipment)

  it("monta o resumo da venda", () => {
    expect(snapshot).toMatchObject({
      orderIds: ["2000003508897196"],
      buyerId: BUYER,
      total: 100,
      orderStatus: "paid",
      paymentStatus: "approved",
      items: [{ itemId: "MLB2608564035", title: "Camiseta Basica", quantity: 2, unitPrice: 50, variation: "Tamanho: M; Cor: Preto" }],
    })
    expect(snapshot.shipment).toMatchObject({ status: "shipped", trackingNumber: "AA123456789BR", logisticType: "drop_off", methodName: "Normal" })
  })

  it("texto para a IA: rastreio, previsão e atraso", () => {
    const text = summarizeOrderForPrompt(snapshot, new Date("2026-10-10T12:00:00Z"))
    expect(text.order).toContain("Venda nº 2000003508897196")
    expect(text.order).toContain("2x Camiseta Basica (Tamanho: M; Cor: Preto)")
    expect(text.order).toContain("Pagamento: aprovado")
    expect(text.shipping).toContain("A caminho (em trânsito)")
    expect(text.shipping).toContain("Código de rastreio: AA123456789BR (Correios)")
    expect(text.shipping).toContain("até 05/10/2026 (JÁ PASSOU)")
    expect(summarizeOrderForPrompt(snapshot, new Date("2026-10-03T12:00:00Z")).shipping).not.toContain("JÁ PASSOU")
  })

  it("sem envio e entregue", () => {
    const noShipping = buildOrderSnapshot([{ ...order, tags: ["no_shipping"] }], null)
    expect(summarizeOrderForPrompt(noShipping).shipping).toContain("sem envio pelo Mercado Livre")
    const delivered = buildOrderSnapshot([order], { ...shipment, status: "delivered", substatus: null, status_history: { date_delivered: "2026-10-04T15:00:00-03:00" } })
    const text = summarizeOrderForPrompt(delivered).shipping
    expect(text).toContain("Entregue em: 04/10/2026")
    expect(text).not.toContain("Previsão")
  })

  it("várias vendas no mesmo pacote somam total e itens", () => {
    const second = { ...order, id: 2000003508897197, total_amount: 30.5, order_items: [{ item: { id: "MLB1", title: "Meia" }, quantity: 1, unit_price: 30.5 }] }
    const combined = buildOrderSnapshot([order, second], null)
    expect(combined.total).toBe(130.5)
    expect(combined.items).toHaveLength(2)
    expect(conversationOrderColumns(combined)).toMatchObject({ items_count: 3, item_id: "MLB2608564035", order_total: 130.5 })
  })

  it("lê o resumo guardado (e tolera lixo)", () => {
    expect(parseOrderSnapshot(JSON.parse(JSON.stringify(snapshot)))?.orderIds).toEqual(["2000003508897196"])
    expect(parseOrderSnapshot({})).toBeNull()
    expect(parseOrderSnapshot(null)).toBeNull()
  })

  it("rótulo curto do envio", () => {
    expect(shippingChip("shipped", "out_for_delivery")).toBe("Saiu para entrega")
    expect(shippingChip("delivered")).toBe("Entregue")
    expect(shippingChip(null)).toBeNull()
  })
})

const ai = (extra: Partial<AfterSaleAiResult> = {}): AfterSaleAiResult => ({
  action: "answer",
  answer: "Olá! Seu pedido já foi enviado e o rastreio é AA123456789BR.",
  confidence: 0.95,
  reason: "Do envio.",
  topic: "tracking",
  ...extra,
})
const settings = { threshold: 0.85, signature: "Equipe Loja", sensitivePolicy: "review" as const, maxLength: 350 }

describe("decisão do agente", () => {
  it("envia com a assinatura quando tem certeza", () => {
    expect(decideAfterSale(ai(), settings)).toEqual({
      kind: "send",
      text: "Olá! Seu pedido já foi enviado e o rastreio é AA123456789BR. Equipe Loja",
    })
  })

  it("escalada, sem texto ou pouca certeza ficam para o vendedor", () => {
    expect(decideAfterSale(ai({ action: "escalate" }), settings)).toEqual({ kind: "review", reason: "ai_escalated" })
    expect(decideAfterSale(ai({ answer: "  " }), settings)).toEqual({ kind: "review", reason: "ai_escalated" })
    expect(decideAfterSale(ai({ confidence: 0.8 }), settings)).toEqual({ kind: "review", reason: "low_confidence" })
  })

  it("assunto delicado depende da escolha da loja; mudança no pedido sempre fica com o vendedor", () => {
    expect(decideAfterSale(ai({ topic: "problem" }), settings)).toEqual({ kind: "review", reason: "sensitive_topic" })
    expect(decideAfterSale(ai({ topic: "problem", action: "escalate" }), settings)).toEqual({ kind: "review", reason: "sensitive_topic" })
    expect(decideAfterSale(ai({ topic: "problem", action: "escalate" }), { ...settings, sensitivePolicy: "guide" })).toEqual({
      kind: "review",
      reason: "ai_escalated",
    })
    expect(decideAfterSale(ai({ topic: "problem" }), { ...settings, sensitivePolicy: "guide" }).kind).toBe("send")
    expect(decideAfterSale(ai({ topic: "change_order" }), { ...settings, sensitivePolicy: "guide" })).toEqual({
      kind: "review",
      reason: "sensitive_topic",
    })
  })

  it("contato externo e texto longo demais nunca saem", () => {
    expect(decideAfterSale(ai({ answer: "Chama no whatsapp 11 98888-7777" }), settings)).toEqual({ kind: "review", reason: "unsafe_answer" })
    expect(decideAfterSale(ai({ answer: "a".repeat(400) }), settings)).toEqual({ kind: "review", reason: "answer_too_long" })
  })

  it("valores desconhecidos caem no padrão seguro", () => {
    expect(parseTopic("xyz")).toBe("other")
    expect(parseSensitivePolicy("xyz")).toBe("review")
    expect(afterSalePresetFor(0.86)).toBe("0.85")
    expect(afterSalePresetFor(0.6)).toBe("0.6")
  })
})

const promptInput = (extra: Partial<AfterSalePromptInput> = {}): AfterSalePromptInput => ({
  storeName: "Loja Teste",
  tone: "cordial",
  knowledge: "- Nota fiscal: A loja emite nota fiscal em todos os pedidos",
  sellerRules: "",
  instructions: "Despachamos em 1 dia útil.",
  sensitivePolicy: "review",
  orderSummary: "Venda nº 1",
  shippingSummary: "Situação do envio: A caminho",
  itemSummary: null,
  history: [
    { sender: "buyer", text: "Oi, comprei ontem", sentAt: "2026-10-10T10:00:00Z" },
    { sender: "seller", text: "Olá! Obrigado.", sentAt: "2026-10-10T10:05:00Z" },
    { sender: "seller", text: "Me chama no zap", sentAt: "2026-10-10T10:06:00Z", rejected: true },
    { sender: "buyer", text: "Já enviaram?", sentAt: "2026-10-10T11:00:00Z", attachments: 1 },
  ],
  examples: [{ buyerMessage: "Quando envia?", answer: "Em 1 dia útil." }],
  maxChars: 330,
  now: new Date("2026-10-10T12:00:00Z"),
  ...extra,
})

describe("prompt do agente", () => {
  it("marca o que espera resposta, o que o ML recusou e os anexos", () => {
    const history = formatHistory(promptInput().history)
    expect(history).toContain("COMPRADOR [AGUARDANDO RESPOSTA] [1 anexo(s) que você não consegue ver]: Já enviaram?")
    expect(history).toContain("LOJA [RECUSADA PELO MERCADO LIVRE")
    expect(history).not.toContain("COMPRADOR [AGUARDANDO RESPOSTA]: Oi, comprei ontem")
  })

  it("histórico longo: guarda as mais recentes", () => {
    const long = Array.from({ length: 40 }, (_, index) => ({ sender: "buyer" as const, text: `m${index}`, sentAt: `2026-10-10T10:${String(index).padStart(2, "0")}:00Z` }))
    const text = formatHistory(long, 30)
    expect(text).toContain("(10 mensagens mais antigas omitidas)")
    expect(text).not.toContain(": m9\n")
    expect(text).toContain(": m39")
  })

  it("regras de segurança, política escolhida e fontes", () => {
    const review = buildAfterSaleSystemPrompt(promptInput())
    expect(review).toContain("REGRA 0")
    expect(review).toContain("ficam com ele")
    expect(review).toContain("No máximo 330 caracteres")
    expect(review).toContain("<INSTRUCOES_DO_VENDEDOR>\nDespachamos em 1 dia útil.")
    expect(review).toContain("<RESPOSTAS_ENSINADAS_PELO_VENDEDOR>")
    const guide = buildAfterSaleSystemPrompt(promptInput({ sensitivePolicy: "guide" }))
    expect(guide).toContain("você acolhe e orienta")
    expect(guide).not.toContain("ficam com ele")
  })

  it("mensagem do usuário traz pedido, envio, anúncio e conversa", () => {
    const [, user] = buildAfterSaleMessages(promptInput({ itemSummary: "Título: Camiseta" }))
    expect(user.content).toContain("<PEDIDO>\nVenda nº 1")
    expect(user.content).toContain("<ENVIO>")
    expect(user.content).toContain("<ANUNCIO>\nTítulo: Camiseta")
    expect(user.content).toContain("<HISTORICO_DA_CONVERSA>")
    expect(user.content).toContain("<DATA_DE_HOJE>")
  })
})

describe("caixa de entrada do pós-venda", () => {
  it("tom de cada conversa", () => {
    expect(conversationTone("needs_review", null)).toBe("open")
    expect(conversationTone("failed", null)).toBe("open")
    expect(conversationTone("processing", null)).toBe("queue")
    expect(conversationTone("answered", "ai")).toBe("ai")
    expect(conversationTone("answered", "manual")).toBe("manual")
    expect(conversationTone("answered", "external")).toBe("external")
    expect(conversationTone("blocked", "ai")).toBe("blocked")
    expect(conversationTone("archived", null)).toBe("archived")
  })

  it("resumo da linha", () => {
    const row = { status: "needs_review", last_answer_source: null, review_reason: "sensitive_topic", last_message_text: "Veio quebrado", last_message_from: "buyer", pending_count: 1 }
    expect(conversationSummary(row)).toEqual({ tone: "open", label: "Assunto delicado: fica com você", preview: "Veio quebrado" })
    expect(conversationSummary({ ...row, status: "answered", last_answer_source: "ai", last_message_from: "seller", last_message_text: "Já enviamos" }).preview).toBe(
      "Você: Já enviamos"
    )
  })

  it("URL da caixa de entrada omite o padrão", () => {
    expect(conversationHref({ tab: "responder", account: null, search: "", page: 1, conversation: null })).toBe("/pos-venda")
    expect(conversationHref({ tab: "agente", account: "a", search: "camiseta", page: 2, conversation: "c" })).toBe(
      "/pos-venda?aba=agente&conta=a&busca=camiseta&pagina=2&c=c"
    )
    expect(parseConversationTab("voce")).toBe("voce")
    expect(parseConversationTab("xyz")).toBe("responder")
  })

  it("busca por número da venda ou por texto", () => {
    expect(conversationSearchFilter("2000003508897196")).toBe("pack_id.eq.2000003508897196,order_ids.cs.{2000003508897196}")
    expect(conversationSearchFilter("camiseta")).toContain("buyer_nickname.ilike.%camiseta%")
    expect(conversationSearchFilter("  ")).toBeNull()
  })

  it("envio atrasado e link da venda", () => {
    const now = new Date("2026-10-10T12:00:00Z")
    expect(isShippingLate({ shipping_status: "shipped", estimated_delivery_at: "2026-10-05T12:00:00Z" }, now)).toBe(true)
    expect(isShippingLate({ shipping_status: "delivered", estimated_delivery_at: "2026-10-05T12:00:00Z" }, now)).toBe(false)
    expect(isShippingLate({ shipping_status: "shipped", estimated_delivery_at: "2026-10-10T00:00:00Z" }, now)).toBe(false)
    expect(saleUrl("123", "999")).toBe("https://www.mercadolivre.com.br/vendas/123/detalhe")
    expect(saleUrl(undefined, "999")).toBe("https://www.mercadolivre.com.br/vendas/999/detalhe")
  })
})
