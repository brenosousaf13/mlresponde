import { describe, expect, it } from "vitest"

import { claimAlerts, type ClaimAlertInput } from "@/lib/reputation/alerts"
import {
  buildClaimMessages,
  buildClaimUserPrompt,
  normalizeClaimAnalysis,
  readClaimAnalysis,
  suggestsExclusion,
  type ClaimPromptInput,
} from "@/lib/reputation/claim-ai"
import {
  MAX_CLAIM_ANALYSES,
  claimActions,
  claimInputHash,
  claimMessageText,
  isRestrictedAction,
  orderSummaryFromMl,
  orderSummaryFromRow,
  parseClaimDetail,
  parseClaimMessages,
  parseExpectedResolutions,
  parsePartialRefundOffers,
  reasonGroup,
  sanitizeAttachmentName,
  validateAttachments,
  validateClaimMessage,
} from "@/lib/reputation/claim-details"
import { detailsQueue, needsDetails } from "@/lib/reputation/claims-engine"
import { EXCLUSION_CASE_IDS } from "@/lib/reputation/exclusions"
import { claimLink, reputationUrl } from "@/lib/reputation/email"
import { actionResponsibleLabel, affectsInfo, claimHref, dueState } from "@/lib/reputation/presentation"

const NOW = new Date("2026-10-19T15:00:00.000Z")
const HOUR = 60 * 60 * 1000

const action = (name: string, mandatory = false, due: string | null = null) => ({ action: name, mandatory, due_date: due })

describe("claimActions", () => {
  it("só mostra ações quando a reclamação está aberta", () => {
    expect(claimActions([action("refund")], "closed")).toEqual({ available: [], onlyInMl: [] })
  })

  it("separa o que a maanu executa do que só dá para fazer no ML", () => {
    const result = claimActions(
      [
        action("send_message_to_complainant", true, "2026-10-20T12:00:00.000Z"),
        action("refund"),
        action("allow_return"),
        action("allow_return_label", true),
        action("add_shipping_evidence", true, "2026-10-21T12:00:00.000Z"),
        action("send_attachments"),
        action("algo_desconhecido"),
      ],
      "opened"
    )
    expect(result.available.map((item) => item.kind)).toEqual(["message_buyer", "refund", "allow_return"])
    // allow_return e allow_return_label viram uma ação só, obrigatória se qualquer uma for.
    expect(result.available.find((item) => item.kind === "allow_return")?.mandatory).toBe(true)
    expect(result.available[0]).toEqual({ kind: "message_buyer", mandatory: true, dueDate: "2026-10-20T12:00:00.000Z" })
    expect(result.onlyInMl).toEqual([
      { action: "add_shipping_evidence", label: "Enviar comprovante de envio", mandatory: true, dueDate: "2026-10-21T12:00:00.000Z" },
    ])
  })

  it("dinheiro e mediação são restritos ao dono ou administrador", () => {
    expect(isRestrictedAction("refund")).toBe(true)
    expect(isRestrictedAction("partial_refund")).toBe(true)
    expect(isRestrictedAction("allow_return")).toBe(true)
    expect(isRestrictedAction("open_dispute")).toBe(true)
    expect(isRestrictedAction("message_buyer")).toBe(false)
    expect(isRestrictedAction("message_mediator")).toBe(false)
  })
})

describe("parsePartialRefundOffers", () => {
  it("ordena as ofertas, descarta as inválidas e respeita o mínimo do ML", () => {
    const offers = parsePartialRefundOffers({
      currency_id: "BRL",
      available_offers: [
        { percentage: 10, amount: 9.9 },
        { percentage: 50, amount: 49.5 },
        { percentage: 30, amount: 29.7 },
        { percentage: 100, amount: 99 },
        { percentage: "x", amount: 1 },
        { percentage: 5, amount: 4.95 },
      ],
      recommendations: [{ type: "maximum", percentage: 30, restrictions: [{ type: "minimum", percentage: 10 }] }],
    })
    expect(offers.currency).toBe("BRL")
    expect(offers.offers).toEqual([
      { percentage: 50, amount: 49.5 },
      { percentage: 30, amount: 29.7 },
      { percentage: 10, amount: 9.9 },
    ])
    expect(offers.recommendedMax).toBe(30)
    expect(offers.minimum).toBe(10)
  })

  it("sem resposta: nenhuma oferta", () => {
    expect(parsePartialRefundOffers(null)).toEqual({ currency: "BRL", offers: [], recommendedMax: null, minimum: null })
  })
})

describe("anexos e mensagens", () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size })

  it("aceita JPG, PNG e PDF dentro dos limites", () => {
    expect(validateAttachments([file("nota.pdf", "application/pdf", 300_000), file("foto.jpg", "image/jpeg", 900_000)])).toBeNull()
  })

  it("recusa tipo errado, arquivo vazio, arquivo grande, total acima de 4 MB e arquivos demais", () => {
    expect(validateAttachments([file("video.mp4", "video/mp4", 100)])).toMatch(/JPG, PNG ou PDF/)
    expect(validateAttachments([file("vazio.png", "image/png", 0)])).toMatch(/vazio/)
    expect(validateAttachments([file("grande.png", "image/png", 6 * 1024 * 1024)])).toMatch(/5 MB/)
    expect(
      validateAttachments([file("a.png", "image/png", 2.5 * 1024 * 1024), file("b.png", "image/png", 2 * 1024 * 1024)])
    ).toMatch(/4 MB no total/)
    expect(validateAttachments(Array.from({ length: 6 }, (_, index) => file(index + ".png", "image/png", 10)))).toMatch(/no máximo 5/)
  })

  it("limpa o nome do arquivo para o formato aceito pelo ML", () => {
    expect(sanitizeAttachmentName("Nota fiscal nº 123 (cópia).PDF", "application/pdf")).toBe("Nota-fiscal-n-123-copia.pdf")
    expect(sanitizeAttachmentName("###.png", "image/png")).toBe("anexo.png")
    expect(sanitizeAttachmentName("a".repeat(300) + ".jpg", "image/jpeg")).toHaveLength(125)
  })

  it("mensagem vazia ou longa demais é recusada", () => {
    expect(validateClaimMessage("   ")).toMatch(/Escreva/)
    expect(validateClaimMessage("x".repeat(2001))).toMatch(/2000/)
    expect(validateClaimMessage("Olá, já enviamos o produto.")).toBeNull()
  })
})

describe("leitura do ML", () => {
  it("mensagens: sem repetição, em ordem e com anexos", () => {
    const rows = parseClaimMessages([
      { hash: "b", sender_role: "respondent", message: " Resposta ", date_created: "2026-10-18T12:00:00.000Z" },
      {
        hash: "a",
        sender_role: "complainant",
        receiver_role: "respondent",
        message: "Não recebi",
        date_created: "2026-10-18T10:00:00.000Z",
        message_moderation: { status: "clean" },
        attachments: [{ filename: "123_foto.jpg", original_filename: "foto.jpg", size: 1000, type: "image/jpeg" }, { size: 1 }],
      },
      { hash: "b", sender_role: "respondent", message: "Resposta", date_created: "2026-10-18T12:00:00.000Z" },
      { sender_role: "mediator", message: "Sem hash", message_date: "2026-10-18T13:00:00.000Z" },
    ])
    expect(rows.map((row) => row.sender_role)).toEqual(["complainant", "respondent", "mediator"])
    expect(rows[0].attachments).toEqual([{ filename: "123_foto.jpg", original_filename: "foto.jpg", size: 1000, type: "image/jpeg" }])
    expect(rows[0].moderation_status).toBe("clean")
    expect(rows[1].message).toBe("Resposta")
    expect(rows[2].hash).toMatch(/^maanu:[0-9a-f]{8}$/)
  })

  it("detalhe e expectativas vazias viram nulo ou lista vazia", () => {
    expect(parseClaimDetail({})).toBeNull()
    expect(parseClaimDetail({ title: "Produto não chegou", due_date: "2026-10-20T10:00:00-03:00" })).toEqual({
      title: "Produto não chegou",
      description: null,
      problem: null,
      due_date: "2026-10-20T13:00:00.000Z",
      action_responsible: null,
    })
    expect(parseExpectedResolutions(null)).toEqual([])
    expect(parseExpectedResolutions([{ player_role: "complainant", expected_resolution: "refund", status: "pending" }, {}])).toEqual([
      { player_role: "complainant", expected_resolution: "refund", status: "pending" },
    ])
  })

  it("resumo da venda guarda itens e valor, nunca dados do comprador", () => {
    const summary = orderSummaryFromMl({
      id: 2000001,
      pack_id: null,
      date_created: "2026-10-01T10:00:00.000Z",
      total_amount: "99.9",
      currency_id: "BRL",
      order_items: [{ item: { title: "Tênis" }, quantity: 2, unit_price: 49.95 }],
      buyer: { nickname: "COMPRADOR", first_name: "Fulano" },
    } as never)
    expect(summary).toEqual({
      order_id: 2000001,
      pack_id: null,
      date: "2026-10-01T10:00:00.000Z",
      total_amount: 99.9,
      currency_id: "BRL",
      items: [{ title: "Tênis", quantity: 2, unit_price: 49.95 }],
    })
    expect(JSON.stringify(summary)).not.toContain("Fulano")
    expect(
      orderSummaryFromRow({ ml_order_id: 5, pack_id: 7, ordered_at: null, total_amount: 10, currency_id: "BRL", items: [{ title: "Boné" }] })
        .items
    ).toEqual([{ title: "Boné", quantity: 1, unit_price: null }])
  })

  it("motivo pelo prefixo do ML", () => {
    expect(reasonGroup("PDD9939")).toBe("Produto com defeito ou diferente do anunciado")
    expect(reasonGroup("PNR3430")).toBe("Produto não recebido")
    expect(reasonGroup("XYZ")).toBeNull()
  })

  it("assinatura da IA muda só quando a reclamação muda", () => {
    const base = { status: "opened", stage: "claim", mlUpdatedAt: "2026-10-19T10:00:00.000Z", actions: [action("refund")], messageHashes: ["a", "b"] }
    expect(claimInputHash(base)).toBe(claimInputHash({ ...base, messageHashes: ["b", "a"] }))
    expect(claimInputHash(base)).not.toBe(claimInputHash({ ...base, messageHashes: ["a", "b", "c"] }))
    expect(claimInputHash(base)).not.toBe(claimInputHash({ ...base, stage: "dispute" }))
  })

  it("detalhe é lido de novo quando o ML muda ou a cada 30 minutos se aberta", () => {
    expect(needsDetails({ status: "opened", details_synced_at: null, ml_updated_at: null }, NOW)).toBe(true)
    const synced = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString()
    expect(needsDetails({ status: "opened", details_synced_at: synced, ml_updated_at: "2026-10-19T14:00:00.000Z" }, NOW)).toBe(false)
    expect(needsDetails({ status: "opened", details_synced_at: synced, ml_updated_at: NOW.toISOString() }, NOW)).toBe(true)
    const old = new Date(NOW.getTime() - 31 * 60 * 1000).toISOString()
    expect(needsDetails({ status: "opened", details_synced_at: old, ml_updated_at: null }, NOW)).toBe(true)
    expect(needsDetails({ status: "closed", details_synced_at: old, ml_updated_at: null }, NOW)).toBe(false)
  })
})

describe("texto das mensagens", () => {
  it("HTML do mediador vira texto com parágrafos, link e negrito sem as tags", () => {
    const html =
      '<p dir="ltr"><span style="white-space: pre-wrap;">Olá, equipe, sou Dafnie Assistente da Mercado Livre; é um prazer atendê-lo hoje.</span>' +
      '<span style="white-space: pre-wrap;"> </span><span style="white-space: pre-wrap;"> </span></p>' +
      '<p><span style="white-space: pre-wrap;"> </span></p><p><br></p>' +
      '<p dir="ltr"><span style="white-space: pre-wrap;">Verifiquei que o pacote ainda está a caminho.</span></p>' +
      '<p dir="ltr"><span style="white-space: pre-wrap;">Você pode acompanhar diretamente no </span>' +
      '<a href="https://www2.correios.com.br/sistemas/rastreamento/default.cfm"><span style="white-space: pre-wrap;">site dos Correios</span></a>' +
      '<span style="white-space: pre-wrap;"> através do código &nbsp; </span><b><strong class="coco-editor-textBold">MM48031482570BRSP02</strong></b>' +
      '<span style="white-space: pre-wrap;">.&nbsp;</span></p><p dir="ltr"><br></p>' +
      '<p dir="ltr"><span>Entrarei em contato no dia 28/10, pois essa &eacute; a data final de entrega</span></p>'
    expect(claimMessageText(html)).toBe(
      [
        "Olá, equipe, sou Dafnie Assistente da Mercado Livre; é um prazer atendê-lo hoje.",
        "",
        "Verifiquei que o pacote ainda está a caminho.",
        "Você pode acompanhar diretamente no site dos Correios (https://www2.correios.com.br/sistemas/rastreamento/default.cfm) através do código MM48031482570BRSP02.",
        "",
        "Entrarei em contato no dia 28/10, pois essa é a data final de entrega",
      ].join("\n")
    )
  })

  it("listas viram marcadores e entidades numéricas são decodificadas", () => {
    expect(claimMessageText("<p>Envie:</p><ul><li>Fotos do produto</li><li>Nota fiscal &#8211; PDF</li></ul>")).toBe(
      "Envie:\n\n• Fotos do produto\n• Nota fiscal – PDF"
    )
    expect(claimMessageText('<p>Veja <a href="https://www.mercadolivre.com.br/ajuda">https://www.mercadolivre.com.br/ajuda</a></p>')).toBe(
      "Veja https://www.mercadolivre.com.br/ajuda"
    )
    expect(claimMessageText('<p><a href="javascript:alert(1)">clique</a></p><script>alert(1)</script>')).toBe("clique")
  })

  it("texto comum fica igual (com < e & no meio) e as quebras de linha são mantidas", () => {
    expect(claimMessageText("O preço < 100 & frete grátis?\nObrigado")).toBe("O preço < 100 & frete grátis?\nObrigado")
    expect(claimMessageText("  Não recebi   o produto  ")).toBe("Não recebi o produto")
    expect(claimMessageText(null)).toBe("")
  })

  it("a mensagem gravada já vem limpa e a assinatura própria não muda com a limpeza", () => {
    const [row] = parseClaimMessages([
      { sender_role: "mediator", message: "<p>Olá, <b>vendedor</b>.</p>", date_created: "2026-10-18T10:00:00.000Z" },
    ])
    expect(row.message).toBe("Olá, vendedor.")
    const [again] = parseClaimMessages([
      { sender_role: "mediator", message: "<p>Olá, <b>vendedor</b>.</p>", date_created: "2026-10-18T10:00:00.000Z" },
    ])
    expect(again.hash).toBe(row.hash)
  })
})

describe("fila do detalhe", () => {
  it("nunca lidas primeiro, depois as que mudaram, depois as abertas a atualizar; abertas e prazo curto na frente", () => {
    const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000).toISOString()
    const ahead = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()
    const rows = [
      { id: "fresca", status: "opened", details_synced_at: ago(5), ml_updated_at: ago(60), next_due_at: ahead(1) },
      { id: "velha-aberta", status: "opened", details_synced_at: ago(40), ml_updated_at: ago(60), next_due_at: ahead(2) },
      { id: "mudou", status: "opened", details_synced_at: ago(20), ml_updated_at: ago(10), next_due_at: ahead(30) },
      { id: "nova-encerrada", status: "closed", details_synced_at: null, ml_updated_at: ago(30), next_due_at: null },
      { id: "nova-prazo-longo", status: "opened", details_synced_at: null, ml_updated_at: ago(30), next_due_at: ahead(48) },
      { id: "nova-prazo-curto", status: "opened", details_synced_at: null, ml_updated_at: ago(30), next_due_at: ahead(3) },
    ]
    expect(detailsQueue(rows, NOW).map((row) => row.id)).toEqual([
      "nova-prazo-curto",
      "nova-prazo-longo",
      "nova-encerrada",
      "mudou",
      "velha-aberta",
    ])
  })
})

describe("análise da IA", () => {
  const valid = {
    summary: "O comprador diz que não recebeu, mas o envio consta entregue.",
    risk: "high",
    best_action: "reply",
    best_action_reason: "Responder com o rastreio antes de pensar em reembolso.",
    buyer_draft: "Olá! O envio consta como entregue em [data]. Pode conferir com a portaria?",
    mediator_draft: "",
    exclusion_case: "delivered_not_received",
    exclusion_confidence: "medium",
    exclusion_text: "O envio consta entregue no rastreio do Mercado Envios.",
  }

  it("aceita uma resposta válida e lê de volta a mesma análise", () => {
    const analysis = normalizeClaimAnalysis(valid)
    expect(analysis).toMatchObject({ risk: "high", bestAction: "reply", exclusionCase: "delivered_not_received", exclusionConfidence: "medium" })
    expect(readClaimAnalysis(JSON.parse(JSON.stringify(analysis)))).toEqual(analysis)
    expect(suggestsExclusion(analysis)).toBe(true)
  })

  it("opções inválidas viram valores seguros e nada lança erro", () => {
    const analysis = normalizeClaimAnalysis({ ...valid, risk: "altíssimo", best_action: "processar", exclusion_case: "inventado" })
    expect(analysis.risk).toBe("medium")
    expect(analysis.bestAction).toBe("reply")
    expect(analysis.exclusionCase).toBe("none")
    expect(analysis.exclusionText).toBe("")
    expect(analysis.exclusionConfidence).toBe("low")
    expect(suggestsExclusion(analysis)).toBe(false)
    expect(normalizeClaimAnalysis(null).summary).toBe("")
    expect(normalizeClaimAnalysis("texto solto").bestAction).toBe("reply")
  })

  it("texto longo é cortado e rascunho com contato externo é descartado", () => {
    const analysis = normalizeClaimAnalysis({
      ...valid,
      summary: "a".repeat(2000),
      buyer_draft: "Me chama no WhatsApp (11) 98888-7777 que resolvo.",
      mediator_draft: "b".repeat(5000),
    })
    expect(analysis.summary.length).toBeLessThanOrEqual(600)
    expect(analysis.summary.endsWith("…")).toBe(true)
    expect(analysis.buyerDraft).toBe("")
    expect(analysis.mediatorDraft.length).toBeLessThanOrEqual(2000)
  })

  it("certeza baixa não vira alerta de exclusão; análise gravada inválida é ignorada", () => {
    expect(suggestsExclusion(normalizeClaimAnalysis({ ...valid, exclusion_confidence: "low" }))).toBe(false)
    expect(readClaimAnalysis({ foo: 1 })).toBeNull()
    expect(readClaimAnalysis(null)).toBeNull()
  })

  it("o prompt traz os fatos, os 11 casos e só as últimas 30 mensagens", () => {
    const input: ClaimPromptInput = {
      storeName: "Loja Teste",
      claim: {
        type: "mediations",
        stage: "claim",
        status: "opened",
        reasonId: "PNR3430",
        reasonDetail: "Não chegou",
        problem: null,
        title: null,
        description: null,
        createdAt: "2026-10-18T10:00:00.000Z",
        dueDate: "2026-10-20T10:00:00.000Z",
        fulfilled: true,
        affects: "affected",
        hasIncentive: true,
      },
      sale: { order_id: 1, pack_id: null, date: "2026-10-10T10:00:00.000Z", total_amount: 99.9, currency_id: "BRL", items: [{ title: "Tênis", quantity: 1, unit_price: 99.9 }] },
      shipping: { status: "delivered", substatus: null, tracking_number: "BR123" },
      expected: [{ player_role: "complainant", expected_resolution: "refund", status: "pending" }],
      messages: Array.from({ length: 40 }, (_, index) => ({ sender_role: "complainant", message: "mensagem " + index, message_at: null })),
      actions: ["message_buyer", "refund"],
      onlyInMl: ["Enviar comprovante de envio"],
    }
    const prompt = buildClaimUserPrompt(input)
    expect(prompt).toContain("Produto não recebido")
    expect(prompt).toContain("BRL 99.90")
    expect(prompt).toContain("Rastreio: BR123")
    expect(prompt).toContain("Quer o dinheiro de volta")
    expect(prompt).toContain("primeiras 48 horas")
    expect(prompt).toContain("- Devolver o dinheiro")
    expect(prompt).toContain("mensagem 39")
    expect(prompt).not.toContain("mensagem 9]")
    expect(prompt).not.toMatch(/mensagem 9$/m)
    const system = buildClaimMessages(input)[0].content
    for (const id of EXCLUSION_CASE_IDS) expect(system).toContain(id)
    expect(system).toContain("Proibido contato fora do Mercado Livre")
    expect(MAX_CLAIM_ANALYSES).toBe(8)
  })
})

describe("alertas de reclamação", () => {
  const base: ClaimAlertInput = {
    id: "00000000-0000-0000-0000-000000000001",
    claim_id: 555,
    type: "mediations",
    status: "opened",
    ml_created_at: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    next_due_at: new Date(NOW.getTime() + 30 * HOUR).toISOString(),
    affects_reputation: "affected",
    exclusion_requested_at: null,
    label: "Tênis de corrida",
    reason: "Produto não recebido",
    exclusionLabel: null,
    suggestsExclusion: false,
  }

  it("reclamação nova vira alerta (as antigas do histórico não)", () => {
    expect(claimAlerts([base], NOW).map((alert) => alert.kind)).toEqual(["claim_new"])
    const old = { ...base, ml_created_at: new Date(NOW.getTime() - 4 * 24 * HOUR).toISOString() }
    expect(claimAlerts([old], NOW)).toEqual([])
    expect(claimAlerts([{ ...base, type: "cancel_purchase" }], NOW)).toEqual([])
  })

  it("prazo vencendo em menos de 24 horas, com a chave pelo prazo", () => {
    const soon = { ...base, ml_created_at: null, next_due_at: new Date(NOW.getTime() + 5 * HOUR).toISOString() }
    const alerts = claimAlerts([soon], NOW)
    expect(alerts.map((alert) => alert.kind)).toEqual(["claim_due_soon"])
    expect(alerts[0].key).toBe("claim_due:555:" + soon.next_due_at)
    expect(alerts[0].data).toEqual({ claim_row_id: base.id, claim_id: 555 })
    expect(claimAlerts([{ ...soon, next_due_at: new Date(NOW.getTime() - HOUR).toISOString() }], NOW)).toEqual([])
  })

  it("possível exclusão só quando conta, a IA sugere e ainda não foi pedida; depois avisa que deixou de contar", () => {
    const candidate = { ...base, ml_created_at: null, next_due_at: null, suggestsExclusion: true, exclusionLabel: "O comprador se arrependeu." }
    expect(claimAlerts([candidate], NOW).map((alert) => alert.kind)).toEqual(["claim_exclusion"])
    const requested = { ...candidate, exclusion_requested_at: new Date(NOW.getTime() - 24 * HOUR).toISOString() }
    expect(claimAlerts([requested], NOW)).toEqual([])
    expect(claimAlerts([{ ...requested, affects_reputation: "not_affected" }], NOW).map((alert) => alert.kind)).toEqual(["claim_excluded"])
    expect(claimAlerts([{ ...candidate, affects_reputation: "not_affected" }], NOW)).toEqual([])
  })

  it("encerrada não gera alerta de reclamação nova nem de prazo", () => {
    expect(claimAlerts([{ ...base, status: "closed", next_due_at: new Date(NOW.getTime() + HOUR).toISOString() }], NOW)).toEqual([])
  })
})

describe("link do e-mail", () => {
  it("uma reclamação leva direto a ela; várias, à aba Reclamações; os outros alertas, à tela Reputação", () => {
    const site = "https://app.maanu.com.br/"
    expect(reputationUrl(site, "acc", claimLink("claim_new", [{ claim_row_id: "row-1" }]))).toBe(
      "https://app.maanu.com.br/reputacao/reclamacoes/row-1?conta=acc"
    )
    expect(reputationUrl(site, "acc", claimLink("claim_due_soon", [{ claim_row_id: "a" }, { claim_row_id: "b" }]))).toBe(
      "https://app.maanu.com.br/reputacao?conta=acc&aba=reclamacoes"
    )
    expect(reputationUrl(site, "acc", claimLink("shipment_late", [{}]))).toBe("https://app.maanu.com.br/reputacao?conta=acc")
  })
})

describe("telas", () => {
  it("prazo: vencido, vence em 24 h, com folga ou sem prazo", () => {
    expect(dueState(null, NOW)).toBe("none")
    expect(dueState(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe("overdue")
    expect(dueState(new Date(NOW.getTime() + 3 * HOUR).toISOString(), NOW)).toBe("soon")
    expect(dueState(new Date(NOW.getTime() + 48 * HOUR).toISOString(), NOW)).toBe("later")
  })

  it("selo de reputação, quem age e link da reclamação", () => {
    expect(affectsInfo("affected").label).toBe("Afeta a reputação")
    expect(affectsInfo("not_affected").label).toBe("Não afeta a reputação")
    expect(affectsInfo(null).label).toBe("Conferindo a reputação")
    expect(actionResponsibleLabel("seller")).toBe("Você")
    expect(actionResponsibleLabel("mediator")).toBe("O Mercado Livre")
    expect(actionResponsibleLabel("x")).toBeNull()
    expect(claimHref("abc", "conta 1")).toBe("/reputacao/reclamacoes/abc?conta=conta%201")
  })
})
