import { ArrowRight } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

export const FAQ = [
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
      "A sugestão do Mercado Livre depende de você abrir, ler e enviar cada resposta. A maanu responde sozinha na hora, com as regras da sua loja, e ainda organiza o que precisa de você, atende o pós-venda e mostra os resultados.",
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
] as const

export function FaqSection({ signupHref }: { signupHref: string }) {
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-24 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Dúvidas</Eyebrow>
          <SectionTitle id="duvidas-title" className="mt-5 lg:text-5xl">
            Perguntas frequentes. <span className="text-muted-foreground">Respondidas por humanos, desta vez.</span>
          </SectionTitle>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Separamos o que mais perguntam antes de começar. Ficou alguma? O teste é grátis: dá para ver tudo funcionando na
            sua loja.
          </p>
          <a
            href={signupHref}
            className={cn(
              buttonVariants(),
              "group mt-9 h-12 rounded-full bg-brand-graphite px-6 text-base font-semibold text-white hover:bg-brand-graphite/90"
            )}
          >
            Testar grátis por {siteConfig.trialDays} dias
            <ArrowRight data-icon="inline-end" aria-hidden className="text-brand-mint transition-transform group-hover:translate-x-0.5" />
          </a>
        </Reveal>

        <Reveal delay={100}>
          <Accordion defaultValue={[FAQ[0].id]} className="gap-3">
            {FAQ.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="rounded-2xl border border-border bg-white px-5 transition-colors not-last:border-b data-open:border-brand-teal/40 data-open:bg-brand-sage/25"
              >
                <AccordionTrigger className="py-5 text-base font-medium hover:no-underline sm:text-lg **:data-[slot=accordion-trigger-icon]:mt-1">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Container>
    </section>
  )
}
