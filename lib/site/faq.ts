/**
 * Perguntas frequentes da página de vendas (puro). A mesma lista alimenta a seção Dúvidas, os dados estruturados
 * (FAQPage) e o /llms.txt — mudou aqui, muda nos três.
 */
import { siteConfig } from "@/lib/config/site"
import { SELLABLE_PLANS, formatPrice } from "@/lib/plans/plans"

export type FaqItem = { id: string; question: string; answer: string }

const formatCount = (value: number | null) => (value === null ? "ilimitadas" : value.toLocaleString("pt-BR"))

function pricingAnswer(): string {
  const plans = SELLABLE_PLANS.map(
    (plan) =>
      `${plan.name}, ${formatPrice(plan.priceMonthly)} por mês (${formatCount(plan.limits.answersPerMonth)} respostas automáticas e ${
        plan.limits.mlAccounts === 1 ? "1 conta" : `${plan.limits.mlAccounts} contas`
      } do Mercado Livre)`
  )
  return `São três planos, todos com cobrança mensal e sem fidelidade: ${plans.join("; ")}. Todos começam com ${siteConfig.trialDays} dias grátis, sem cartão.`
}

export const FAQ: readonly FaqItem[] = [
  {
    id: "o-que-e",
    question: "O que é a maanu?",
    answer: `A ${siteConfig.name} é uma plataforma brasileira que responde automaticamente, com inteligência artificial, as perguntas que os compradores fazem nos seus anúncios do Mercado Livre. Ela lê o anúncio inteiro e as regras da sua loja, responde em segundos, 24 horas por dia, e deixa com você o que ela não tiver certeza. E ainda protege a reputação da sua conta com o Escudo de Reputação.`,
  },
  {
    id: "cartao",
    question: "Preciso cadastrar cartão para testar?",
    answer: `Não. São ${siteConfig.trialDays} dias grátis com tudo do plano Pro, sem cartão. Você só informa um cartão se decidir assinar, por dentro do app.`,
  },
  {
    id: "errar",
    question: "E se a IA responder errado?",
    answer:
      "Ela só responde sozinha quando tem certeza, e você escolhe o nível de rigor. Na dúvida, a pergunta fica com você com uma sugestão pronta. Se você corrigir uma resposta, use “Ensinar a IA” e ela aprende para as próximas.",
  },
  {
    id: "recuperador",
    question: "O que é o Recuperador e a maanu recupera o dinheiro sozinha?",
    answer:
      "O Recuperador é a parte da maanu que olha as devoluções da sua conta no Mercado Livre, incluída em todos os planos. Quando o produto volta sem condição de venda, o armazém do Mercado Livre pode devolver o dinheiro ao comprador, e o prazo para contestar é curto. A maanu avisa na hora, no app e por e-mail, mostra o valor e o prazo, e te ajuda a contestar ou revisar pelo celular: você escolhe o motivo, tira as fotos e a IA escreve o relato. Ela não contesta sozinha, só envia o que você confirmar, e quem decide cada caso é o Mercado Livre. O Raio-X ainda lê as devoluções dos últimos 90 dias para mostrar o que ficou para trás.",
  },
  {
    id: "reputacao",
    question: "O que é o Escudo de Reputação?",
    answer:
      "É a parte da maanu que protege a cor do seu termômetro no Mercado Livre, incluída em todos os planos. Ela mostra quanto falta para a sua conta cair de cor em reclamações, cancelamentos e atrasos, avisa no app e por e-mail quando um envio está perto do prazo de despacho e prepara com IA a resposta de cada reclamação. Nada sai sozinho: você revisa e aprova, e reembolso, devolução ou mediação só acontecem com o seu clique.",
  },
  {
    id: "quanto-custa",
    question: "Quanto custa a maanu?",
    answer: pricingAnswer(),
  },
  {
    id: "produtos",
    question: "Funciona para qualquer tipo de produto?",
    answer:
      "Sim. Ela lê cada anúncio (ficha técnica, variações, estoque, tabela de medidas e descrição) e responde sobre aquele produto, seja roupa, eletrônico, casa ou peça. O que não estiver no anúncio nem nas regras da sua loja, ela não inventa.",
  },
  {
    id: "senha",
    question: "A maanu precisa da minha senha do Mercado Livre?",
    answer:
      "Não. A conexão é feita pela autorização oficial do Mercado Livre, na tela do próprio Mercado Livre. Você pode desconectar quando quiser, pela maanu ou pelas configurações de segurança da sua conta.",
  },
  {
    id: "configurar",
    question: "Quanto tempo leva para começar?",
    answer:
      "Poucos minutos. Conectar a conta é um clique, e a configuração guiada faz perguntas simples sobre a sua loja (garantia, envio, trocas, jeito de falar). Dá para ajustar tudo depois.",
  },
  {
    id: "sugestao-ml",
    question: "Qual a diferença para a resposta sugerida do Mercado Livre?",
    answer:
      "A sugestão do Mercado Livre depende de você abrir, ler e enviar cada resposta. A maanu responde sozinha na hora, com as regras da sua loja, e ainda organiza o que precisa de você, atende o pós-venda, protege a sua reputação e mostra os resultados.",
  },
  {
    id: "conta-resposta",
    question: "O que conta como resposta no meu plano?",
    answer:
      "Cada resposta enviada pela IA, nas perguntas e no pós-venda. Sugestões, testes e as respostas que você mesmo envia não contam.",
  },
  {
    id: "limite",
    question: "E se acabar o limite do mês?",
    answer:
      "Nada se perde: as novas perguntas ficam com você para responder, e o limite renova no dia 1º. Você recebe um aviso antes de chegar lá e pode trocar de plano a qualquer momento.",
  },
  {
    id: "cancelar",
    question: "Posso cancelar quando quiser?",
    answer: "Pode. Sem fidelidade e sem multa, pelo próprio app. Você continua com acesso até o fim do período que já pagou.",
  },
  {
    id: "contas",
    question: "Funciona com mais de uma conta do Mercado Livre?",
    answer: "Sim: 1 conta no Starter, 3 no Pro e 10 no Escala, todas no mesmo painel e cada uma com o próprio jeito de responder.",
  },
  {
    id: "marketplaces",
    question: "Funciona na Shopee, na Amazon ou em outros marketplaces?",
    answer: "Por enquanto, só no Mercado Livre. É onde a maanu é especialista.",
  },
]
