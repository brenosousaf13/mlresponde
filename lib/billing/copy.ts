// Textos do formulário de CPF/CNPJ + endereço. No cadastro (pessoa começando o teste grátis) não se fala em
// cobrança, pagamento, assinatura ou nota fiscal: os dados aparecem como "titular da conta". Em Configurações, onde
// o cliente cuida da assinatura, os mesmos dados aparecem como "dados de cobrança".
import { siteConfig } from "@/lib/config/site"

export type BillingFormVariant = "signup" | "settings"

export type BillingFormCopy = {
  holderTitle: string
  holderDescription: string
  cpfOption: string
  cnpjOption: string
  addressDescription: string
}

export const BILLING_FORM_COPY: Record<BillingFormVariant, BillingFormCopy> = {
  signup: {
    holderTitle: "Titular da conta",
    holderDescription: "A pessoa ou a empresa responsável por esta conta.",
    cpfOption: "Conta no seu CPF",
    cnpjOption: "Conta no CNPJ da empresa",
    addressDescription: "Seu endereço ou o da sua empresa.",
  },
  settings: {
    holderTitle: "Titular da cobrança",
    holderDescription: "Quem paga a assinatura e recebe a nota fiscal.",
    cpfOption: "Cobrança no seu CPF",
    cnpjOption: "Cobrança no CNPJ da empresa",
    addressDescription: "O endereço de cobrança, que vai na nota fiscal.",
  },
}

/** Cabeçalho e rodapé da etapa de CPF/CNPJ no cadastro (/onboarding). */
export const ONBOARDING_HOLDER_COPY = {
  /** Cadastro novo (etapa 2 de 2). */
  firstTime: {
    title: "Dados da conta",
    description: "Último passo: conte quem é o titular da conta. Seu teste continua grátis e sem cartão.",
    submitLabel: "Concluir cadastro",
  },
  /** Conta que já existia e ainda não tinha esses dados. */
  existing: {
    title: "Complete seu cadastro",
    description: `Para continuar usando a ${siteConfig.name}, informe o CPF ou CNPJ e o endereço do titular da conta.`,
    submitLabel: "Salvar e continuar",
  },
  /** Antes do link da Política de Privacidade. */
  privacyNotice: "Seus dados ficam protegidos e são tratados conforme a",
} as const
