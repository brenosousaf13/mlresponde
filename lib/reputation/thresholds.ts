/**
 * Limites oficiais da reputação do Mercado Livre no Brasil (MLB) e o que cada cor tranca. Puro.
 *
 * Fontes (conferidas em 2026-10-19; se o ML mudar, atualizar aqui e a data):
 *  - Central de Vendedores, "Vamos mudar a forma como calculamos sua reputação" (vale desde 10/09/2026): limites por
 *    período (60 ou 365 dias) e o corte de 101 vendas em 60 dias.
 *  - developers.mercadolivre.com.br › Reputação de vendedores (2025-08-11): fórmulas, MercadoLíder e o mínimo de 10 vendas.
 *  - Central de ajuda (tabelas de envio por cor, Flex, Product Ads e campanhas), via resumo conferido em set/2026.
 */

export const THRESHOLDS_CHECKED_AT = "2026-10-19"

/** Cor do termômetro (level_id do ML) ou "none" = sem reputação (cinza). */
export type ReputationColor = "green" | "light_green" | "yellow" | "orange" | "red" | "none"

/** Faixas dos limites: verde (inclui verde-claro), amarelo, laranja e vermelho. */
export type Band = "green" | "yellow" | "orange" | "red"

export type MetricKey = "claims" | "cancellations" | "delayed"

/** Limite máximo (fração) de cada faixa: até green = verde; até yellow = amarelo; até orange = laranja; acima = vermelho. */
export type BandLimits = { green: number; yellow: number; orange: number }

export type PeriodDays = 60 | 365

export const METRIC_KEYS: readonly MetricKey[] = ["claims", "cancellations", "delayed"]

export const LIMITS: Record<MetricKey, Record<PeriodDays, BandLimits>> = {
  // Reclamações: o mesmo limite nos dois períodos.
  claims: {
    60: { green: 0.02, yellow: 0.045, orange: 0.08 },
    365: { green: 0.02, yellow: 0.045, orange: 0.08 },
  },
  // Vendas canceladas por você.
  cancellations: {
    60: { green: 0.015, yellow: 0.035, orange: 0.04 },
    365: { green: 0.025, yellow: 0.055, orange: 0.065 },
  },
  // Envios com atraso (delayed handling time).
  delayed: {
    60: { green: 0.1, yellow: 0.18, orange: 0.22 },
    365: { green: 0.13, yellow: 0.235, orange: 0.285 },
  },
}

/** MercadoLíder (qualquer medalha): limites mais apertados, além do verde escuro. */
export const LEADER_LIMITS: Record<MetricKey, number> = { claims: 0.01, cancellations: 0.005, delayed: 0.06 }

/** Sem 10 vendas concluídas nos últimos 365 dias não há reputação (termômetro cinza). */
export const MIN_SALES_FOR_REPUTATION = 10

/** Com 101 vendas ou mais nos últimos 60 dias, a medição é pelos últimos 60 dias; senão, 365. */
export const SIXTY_DAY_MIN_SALES = 101

export const METRIC_LABELS: Record<MetricKey, { title: string; singular: string; plural: string; short: string }> = {
  claims: { title: "Reclamações", singular: "reclamação", plural: "reclamações", short: "reclamações" },
  cancellations: {
    title: "Canceladas por você",
    singular: "venda cancelada",
    plural: "vendas canceladas",
    short: "cancelamentos",
  },
  delayed: { title: "Envios com atraso", singular: "envio atrasado", plural: "envios atrasados", short: "atrasos" },
}

export const COLOR_LABELS: Record<ReputationColor, string> = {
  green: "verde",
  light_green: "verde-claro",
  yellow: "amarelo",
  orange: "laranja",
  red: "vermelho",
  none: "sem cor",
}

export const BAND_LABELS: Record<Band, string> = { green: "verde", yellow: "amarelo", orange: "laranja", red: "vermelho" }

/** Do pior para o melhor (ordem do termômetro). */
export const COLOR_RANK: Record<ReputationColor, number> = {
  none: 0,
  red: 1,
  orange: 2,
  yellow: 3,
  light_green: 4,
  green: 5,
}

/** O que cada cor libera ou tranca (para quando não há desconto de frete para mostrar em R$). */
export const COLOR_PERKS: readonly { title: string; detail: string }[] = [
  {
    title: "Frete mais barato",
    detail:
      "O ML tem uma tabela de envio para cada cor: no verde há até 50% de desconto, no amarelo até 40% e no laranja ou vermelho nenhum (o mesmo envio pode custar o dobro).",
  },
  { title: "Envios Flex", detail: "Só com reputação verde ou amarela." },
  { title: "Product Ads", detail: "Exige pelo menos amarelo (fora do Programa Decola)." },
  { title: "Campanhas de desconto do vendedor", detail: "Exigem reputação verde." },
  { title: "Exposição nas buscas", detail: "Atendimento ruim tira exposição dos anúncios; MercadoLíder ganha prioridade." },
]

