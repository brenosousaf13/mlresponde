export const siteConfig = {
  name: "maanu",
  tagline: "Respostas automáticas com IA para marketplaces",
  slogan: "Mais conversas. Mais vendas. Menos trabalho.",
  description:
    "Respostas automáticas com IA para marketplaces: a maanu atende os compradores dos seus anúncios no Mercado Livre em segundos, a qualquer hora.",
  trialDays: 7,
  termsVersion: "2026-10-11",
  /** Endereço da página de vendas (o app pode ficar em outro endereço: APP_HOST, lib/site/host.ts). */
  marketingUrl: "https://maanu.com.br",
} as const

/**
 * Dados públicos da empresa e canais de contato (rodapé da página de vendas).
 * Contatos em null = ainda não informados: a página mostra um espaço marcado "a definir" no lugar.
 * Sem razão social no rodapé (decisão do Breno, Sessão 25): só o CNPJ.
 */
export const companyInfo: {
  cnpj: string
  email: string | null
  /** WhatsApp com DDI e DDD, só números (ex.: "5511999999999"). */
  whatsapp: string | null
  /** Usuário do Instagram, sem @. */
  instagram: string | null
} = {
  cnpj: "65.771.781/0001-63",
  email: null,
  whatsapp: null,
  instagram: null,
}
