/**
 * Regras de exclusão de reclamações do Mercado Livre (Central de Vendedores, "Conheça as regras de exclusão de
 * reclamações", conferida em 2026-10-19). Puro. Os ids são da maanu (a IA responde um deles ou "none").
 */

export const EXCLUSION_CASES = [
  { id: "opened_by_mistake", label: "O comprador abriu a reclamação por engano." },
  { id: "unrecognized_purchase", label: "O comprador não reconhece a compra." },
  { id: "delivered_not_received", label: "O comprador não recebeu, mas o envio aparece como entregue." },
  { id: "buyer_regret", label: "O comprador se arrependeu, mas o produto está em perfeitas condições." },
  { id: "used_as_contact", label: "O comprador usou a reclamação como meio de contato." },
  {
    id: "carrier_delay_on_time",
    label: "Reclamação pela demora dos Correios ou do Mercado Envios, com o envio dentro do prazo.",
  },
  { id: "platform_issue", label: "Problema que está afetando a plataforma do Mercado Livre como um todo." },
  { id: "competitor_or_revenge", label: "Reclamação aberta pela concorrência ou por vingança." },
  {
    id: "response_within_deadline",
    label: "A resposta à mensagem do comprador ainda estava no prazo (24 horas úteis desde o primeiro contato).",
  },
  {
    id: "size_or_model_change",
    label: "O comprador quer trocar por outro tamanho ou modelo (autopeças, vestuário, bolsas e calçados).",
  },
  {
    id: "account_fraud",
    label: "Entrada não autorizada na conta, transação fraudulenta ou suspensão incorreta pelo Mercado Livre.",
  },
] as const

export type ExclusionCaseId = (typeof EXCLUSION_CASES)[number]["id"]

export const EXCLUSION_CASE_IDS: readonly ExclusionCaseId[] = EXCLUSION_CASES.map((item) => item.id)

/** Casos em que o ML NÃO analisa (a reclamação conta). */
export const NOT_EXCLUDABLE = [
  "A reclamação tem uma mediação aberta com o Mercado Livre.",
  "A exclusão já foi analisada e recusada pelo Mercado Livre.",
  "O produto está com defeito ou diferente do anunciado.",
  "O comprador recebeu menos produtos ou menos partes do que o anunciado.",
  "O produto não foi despachado, foi despachado fora do prazo ou faltou estoque.",
  "O comprador alega que o produto é falsificado.",
  "O vendedor não respondeu a mensagem no prazo (24 horas úteis).",
  "Faltaram ou estão errados os veículos compatíveis no anúncio.",
  "Uso inadequado da ferramenta ou conduta contra os Termos do Mercado Livre.",
] as const

/** Onde pedir a exclusão no ML (o ML não tem API para isso). */
export const EXCLUSION_HOW_TO =
  "No Mercado Livre: Métricas › Atendimento aos seus compradores › Revisar todos › Vendas com problemas › coluna de exclusão."

export const EXCLUSION_RULES_URL =
  "https://vendedores.mercadolivre.com.br/aprender/nota/conheca-as-regras-de-exclusao-de-reclamacoes-nuevo"

export function exclusionLabel(id: string | null | undefined): string | null {
  return EXCLUSION_CASES.find((item) => item.id === id)?.label ?? null
}

