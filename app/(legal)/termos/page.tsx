import type { Metadata } from "next"

import { LegalPage, type LegalSection } from "@/components/legal/legal-page"
import { siteConfig } from "@/lib/config/site"

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: `Termos de Uso da ${siteConfig.name}, a plataforma de respostas automáticas com IA para o Mercado Livre.`,
  // Endereço oficial fixo: a página também abre no endereço do app, mas o Google deve guardar só esta.
  alternates: { canonical: `${siteConfig.marketingUrl}/termos` },
}

const name = siteConfig.name

const sections: LegalSection[] = [
  {
    title: "Aceitação",
    paragraphs: [
      `Ao criar uma conta na ${name}, você declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade. Se não concordar, não utilize a plataforma.`,
    ],
  },
  {
    title: "O serviço",
    paragraphs: [
      `A ${name} é uma plataforma que ajuda vendedores do Mercado Livre a atender compradores usando inteligência artificial, incluindo a geração e o envio automático de respostas às perguntas feitas nos anúncios.`,
      "As respostas são geradas a partir das informações dos anúncios e das orientações que você cadastra. Você é responsável por manter essas informações corretas e por acompanhar as respostas enviadas em nome da sua loja.",
    ],
  },
  {
    title: "Conta e acesso",
    paragraphs: [
      "Você deve informar dados verdadeiros no cadastro e manter sua senha em sigilo. Toda atividade realizada com o seu acesso é de sua responsabilidade.",
      "Cada conta do Mercado Livre só pode estar vinculada a um cadastro na plataforma.",
    ],
  },
  {
    title: "Integração com o Mercado Livre",
    paragraphs: [
      "Para funcionar, a plataforma precisa da sua autorização no Mercado Livre. Você pode desconectar a conta pela plataforma e revogar a autorização a qualquer momento nas configurações de segurança do Mercado Livre.",
      "O uso da plataforma não altera as regras do Mercado Livre, que continuam valendo para a sua conta de vendedor.",
    ],
  },
  {
    title: "Teste grátis, planos e pagamento",
    paragraphs: [
      `Novas contas têm ${siteConfig.trialDays} dias de teste grátis, sem necessidade de cartão. Ao final do teste, as funcionalidades ficam bloqueadas até a contratação de um plano.`,
      "Os planos são cobrados de forma recorrente (mensal ou anual, conforme a escolha), até o cancelamento. Os limites e valores de cada plano são informados na página de assinatura.",
      "O pagamento é processado pela AbacatePay, com cartão de crédito. Se uma cobrança for recusada, novas tentativas são feitas nos dias seguintes; se todas falharem, a assinatura é cancelada.",
      "A troca para um plano mais caro vale na hora, e o novo valor é cobrado a partir da próxima renovação. A troca para um plano mais barato vale a partir da próxima renovação.",
    ],
  },
  {
    title: "Uso adequado",
    paragraphs: [
      "É proibido usar a plataforma para enviar conteúdo ilegal, enganoso ou ofensivo, para violar direitos de terceiros ou as políticas do Mercado Livre, ou para tentar acessar dados de outros clientes.",
    ],
  },
  {
    title: "Responsabilidade",
    paragraphs: [
      "Trabalhamos para manter a plataforma disponível e segura, mas não garantimos funcionamento ininterrupto nem que as respostas geradas pela inteligência artificial estejam sempre livres de erros.",
      "Não nos responsabilizamos por indisponibilidades ou mudanças nas APIs do Mercado Livre.",
    ],
  },
  {
    title: "Cancelamento",
    paragraphs: [
      "Você pode cancelar a assinatura a qualquer momento, pela página de assinatura. Depois do cancelamento não há novas cobranças, e o acesso continua até o fim do período já pago. Podemos suspender contas que violem estes termos.",
    ],
  },
  {
    title: "Alterações e lei aplicável",
    paragraphs: [
      "Podemos atualizar estes termos. Mudanças relevantes serão comunicadas pela plataforma. Estes termos são regidos pelas leis da República Federativa do Brasil.",
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      intro={`Estas são as regras para usar a ${name}.`}
      sections={sections}
    />
  )
}
