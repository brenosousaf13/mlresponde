import type { Metadata } from "next"

import { LegalPage, type LegalSection } from "@/components/legal/legal-page"
import { siteConfig } from "@/lib/config/site"

export const metadata: Metadata = { title: "Política de Privacidade" }

const name = siteConfig.name

const sections: LegalSection[] = [
  {
    title: "Dados que coletamos",
    paragraphs: [
      "Dados de cadastro: nome, e-mail, WhatsApp e nome da loja ou empresa.",
      "Dados de cobrança: CPF ou CNPJ, nome completo ou razão social e endereço do titular da assinatura. O CPF/CNPJ fica vinculado a uma única conta.",
      "Dados do Mercado Livre que você autoriza: identificação da conta de vendedor, perguntas e respostas dos anúncios, informações dos anúncios e, conforme as funcionalidades usadas, dados de pedidos e mensagens.",
      "Dados técnicos necessários ao funcionamento, como registros de acesso e cookies essenciais de sessão.",
    ],
  },
  {
    title: "Como usamos os dados",
    paragraphs: [
      "Para criar e manter sua conta, prestar o serviço contratado (incluindo a geração de respostas com inteligência artificial), dar suporte, enviar avisos importantes sobre a conta e cumprir obrigações legais.",
      "Os dados de cobrança são usados para cobrar a assinatura, emitir nota fiscal e evitar contas duplicadas. Podem ser compartilhados com o meio de pagamento e com o emissor de notas fiscais, apenas para essas finalidades.",
      "Não vendemos seus dados pessoais.",
    ],
  },
  {
    title: "Compartilhamento",
    paragraphs: [
      "Usamos fornecedores de infraestrutura e tecnologia para operar a plataforma, como provedores de banco de dados, hospedagem e de inteligência artificial, que tratam os dados apenas para prestar esses serviços.",
      "O Mercado Livre recebe as respostas e ações que a plataforma envia em seu nome.",
    ],
  },
  {
    title: "Segurança",
    paragraphs: [
      "Adotamos medidas técnicas para proteger os dados, como controle de acesso por conta, isolamento entre clientes e criptografia das credenciais de acesso ao Mercado Livre.",
    ],
  },
  {
    title: "Retenção",
    paragraphs: [
      "Mantemos os dados enquanto a conta estiver ativa e pelo tempo necessário para cumprir obrigações legais. Você pode pedir a exclusão da sua conta.",
    ],
  },
  {
    title: "Seus direitos",
    paragraphs: [
      "Nos termos da Lei Geral de Proteção de Dados (LGPD), você pode pedir confirmação de tratamento, acesso, correção, portabilidade e eliminação dos seus dados, além de informações sobre compartilhamento, pelos canais de suporte da plataforma.",
    ],
  },
  {
    title: "Alterações",
    paragraphs: [
      "Podemos atualizar esta política. Mudanças relevantes serão comunicadas pela plataforma.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      intro={`Como o ${name} trata os seus dados.`}
      sections={sections}
    />
  )
}
