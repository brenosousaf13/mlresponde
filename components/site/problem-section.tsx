import { BuyerRace } from "./buyer-race"
import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

export function ProblemSection() {
  return (
    <section id="problema" aria-labelledby="problema-title" className="pt-10 pb-12 sm:pt-14 sm:pb-16">
      <Container>
        <Reveal className="mx-auto max-w-4xl text-center">
          <Eyebrow>O problema</Eyebrow>
          <SectionTitle id="problema-title" className="mt-5">
            O comprador não espera.{" "}
            <span className="text-muted-foreground">
              Ele pergunta em três lojas e compra de quem{" "}
              <span className="bg-[linear-gradient(var(--brand-sage),var(--brand-sage))] bg-[length:100%_42%] bg-bottom bg-no-repeat text-brand-teal-ink">
                responde primeiro.
              </span>
            </span>
          </SectionTitle>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
            Pergunta parada é venda indo para o concorrente. E ninguém consegue ficar de olho no celular 24 horas por dia,
            sete dias por semana. <span className="font-medium text-foreground">A maanu consegue.</span>
          </p>
        </Reveal>

        <Reveal delay={120} className="mx-auto mt-14 max-w-6xl">
          <BuyerRace />
        </Reveal>
      </Container>
    </section>
  )
}
