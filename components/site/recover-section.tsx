"use client"

import { CheckIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { formatBRL } from "@/lib/site/calculator"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { CountUp } from "./count-up"
import { Headline } from "./headline"
import { LETTERS } from "./letters"
import { Phone } from "./phone"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { Shot } from "./shot"
import { SiteButton } from "./site-button"

const U_PATH = LETTERS[4].d

/** A letra "u" da maanu vira um cofrinho: moedas caem dentro dela e ela se enche de teal. */
function CoinCatcher() {
  const coins = [
    { x: "36%", d: "0s" },
    { x: "50%", d: "0.9s" },
    { x: "43%", d: "1.8s" },
    { x: "55%", d: "2.7s" },
    { x: "39%", d: "3.6s" },
    { x: "51%", d: "4.5s" },
  ]
  return (
    <div className="relative mx-auto w-full max-w-[24rem]">
      <div className="relative aspect-square w-full" aria-hidden>
        <svg viewBox="486 -8 112 116" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <clipPath id="u-clip">
              <path d={U_PATH} />
            </clipPath>
          </defs>
          <path d={U_PATH} fill="rgb(255 255 255 / 0.06)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.8" />
          <g clipPath="url(#u-clip)">
            <rect x="480" y="-10" width="130" height="125" fill="var(--brand-mint)" className="u-liquid" />
          </g>
        </svg>
        <div className="absolute inset-0 [container-type:size]" style={{ "--fall": "74cqh" } as CSSProperties}>
          {coins.map((coin) => (
            <span key={coin.d} className="coin coin-fall site-motion" style={{ left: coin.x, top: "-4%", "--d": coin.d } as CSSProperties}>
              R$
            </span>
          ))}
        </div>
      </div>
      <p className="-mt-2 text-center text-base text-white/75">
        Na loja de demonstração, a maanu já recuperou{" "}
        <CountUp value={1247.3} format={formatBRL} duration={3000} className="font-semibold text-white" />.
      </p>
    </div>
  )
}

const SPOTS = [
  { left: "19.3%", width: "25.7%", caption: "Para recuperar agora", text: "Devoluções que chegaram e contestações liberadas, com o prazo para agir." },
  { left: "46%", width: "25.7%", caption: "Ficou para trás (90 dias)", text: "O Raio-X mostra o dinheiro que já foi para o comprador, e o que ainda dá para contestar." },
  { left: "72.7%", width: "25.8%", caption: "Recuperado pela maanu", text: "Só conta o que o Mercado Livre confirmou a seu favor." },
] as const

const ALERTS = [
  { tag: "Revise agora", tone: "text-red-300", title: "Chegou a devolução", body: "Fone Bluetooth sem fio · revise até amanhã, 14:40" },
  { tag: "Dá para contestar", tone: "text-amber-300", title: "R$ 289,90 voltaram para o comprador", body: "O armazém do ML marcou o tênis como sem condição de venda · contestar até 23/10" },
  { tag: "Recuperado", tone: "text-brand-mint", title: "R$ 219,90 de volta para você", body: "O Mercado Livre deu razão a você na contestação da jaqueta jeans" },
] as const

export function RecoverSection({ signupHref }: { signupHref: string }) {
  return (
    <section id="recuperar" aria-labelledby="recuperar-title" data-nav="dark" className="pre-pixel relative isolate overflow-clip bg-[#0c4a43] pt-8 text-white">
      <Container className="max-w-7xl">
        {/* O diferencial, com a letra "u" juntando as moedas. */}
        <div className="grid grid-cols-1 items-center gap-12 pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-24">
          <div className="lg:col-span-7">
            <Headline
              id="recuperar-title"
              as="h2"
              dot="mint"
              className="font-display text-[2.7rem] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-[5.4rem]"
            >
              O dinheiro que passou batido no Mercado Livre. <span className="text-brand-mint">Recupere</span>
            </Headline>
            <Reveal delay={120}>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-white/80 sm:text-xl">
                Quando uma devolução volta <b className="font-semibold text-white">sem condição de venda</b>, o armazém do Mercado Livre
                pode devolver o dinheiro ao comprador. Você até pode contestar, mas o prazo é curto e o aviso quase não aparece.
                O <b className="font-semibold text-white">Recuperador</b> lê cada devolução da sua conta, avisa na hora e ajuda você
                a contestar com motivo, relato e fotos. É exclusivo da maanu e vem em todos os planos.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <SiteButton href={signupHref} variant="teal" size="lg">
                  Testar o Recuperador grátis
                </SiteButton>
                <SiteButton href="#recuperar-como" variant="outline-dark" size="lg" icon="down">
                  Ver como funciona
                </SiteButton>
              </div>
            </Reveal>
          </div>
          <Reveal delay={200} className="lg:col-span-5">
            <CoinCatcher />
          </Reveal>
        </div>

        {/* A tela real, com as três áreas que importam acendendo uma a uma. */}
        <Reveal className="mt-20 sm:mt-28">
          <div className="shot-frame shot-frame-dark mx-auto max-w-[70rem]">
            <div className="shot-bar">
              <i />
              <i />
              <i />
              <span>app.maanu.com.br/recuperador</span>
            </div>
            <div className="relative">
              <Shot name="recuperadorVisao" sizes="(min-width: 1200px) 1120px, 100vw" />
              {SPOTS.map((spot, index) => (
                <span
                  key={spot.caption}
                  aria-hidden
                  className="spot site-motion"
                  style={{ left: spot.left, width: spot.width, top: "21%", height: "29.4%", "--k": index } as CSSProperties}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-white/55">Tela real da maanu com dados fictícios de demonstração.</p>
          <ul className="mx-auto mt-8 grid max-w-[70rem] grid-cols-1 gap-5 sm:grid-cols-3">
            {SPOTS.map((spot, index) => (
              <li key={spot.caption} className="cap-glow site-motion border-t border-white/25 pt-4" style={{ "--k": index } as CSSProperties}>
                <p className="font-display text-xl font-semibold tracking-tight">{spot.caption}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{spot.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Como funciona, em três cenas. */}
        <div id="recuperar-como" className="mt-28 flex scroll-mt-28 flex-col gap-24 sm:mt-40 sm:gap-36">
          <Scene
            title="Avisamos na hora, com o prazo"
            text="Quando a devolução chega até você, ou quando o armazém do Mercado Livre devolve o dinheiro ao comprador, a maanu avisa no app e por e-mail, com o valor e o prazo para agir."
            visual={
              <div className="mx-auto w-full max-w-md">
                <ul className="flex flex-col">
                  {ALERTS.map((alert, index) => (
                    <li key={alert.title} className="alert-in site-motion border-t border-white/20 py-5 first:border-t-0 first:pt-0" style={{ "--k": index } as CSSProperties}>
                      <p className={cn("text-sm font-semibold", alert.tone)}>{alert.tag}</p>
                      <p className="mt-1 text-lg leading-snug font-semibold">{alert.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">{alert.body}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-white/65">O mesmo aviso chega por e-mail, com o link direto para a devolução.</p>
              </div>
            }
          />
          <Scene
            flip
            title="Você resolve pelo celular, em 1 minuto"
            text="Chegou certinho? Um toque. Chegou com problema ou quer contestar o armazém? Escolha o motivo, tire as fotos e a IA escreve o relato. Nada vai ao Mercado Livre sem o seu clique."
            bullets={["Checklist e guia de fotos para cada motivo", "Relato escrito pela IA, que você edita", "Histórico de tudo o que foi enviado"]}
            visual={
              <Phone>
                <Shot name="mobileDevolucoes" sizes="248px" className="h-full w-full object-cover object-top" />
              </Phone>
            }
          />
          <Scene
            title="O Raio-X procura o que ficou para trás"
            text="A maanu lê as devoluções dos últimos 90 dias e mostra onde o produto voltou sem condição de venda e o dinheiro foi para o comprador, com a força do argumento para contestar e o texto pronto para a Ajuda do ML."
            bullets={["Valor de cada achado, somado", "Argumento forte, vale contestar ou fraco", "Contestações em análise, acompanhadas"]}
            visual={
              <div className="shot-frame shot-frame-dark">
                <div className="h-[22rem] overflow-hidden sm:h-[26rem]">
                  <Shot name="recuperadorRaioX" sizes="(min-width: 1024px) 640px, 100vw" className="w-[150%] max-w-none sm:w-[135%]" />
                </div>
              </div>
            }
          />
        </div>

        <Reveal className="mt-24 sm:mt-36">
          <div className="flex flex-col gap-8 border-t border-white/25 pt-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
                Deixe o Recuperador olhar as suas devoluções nos próximos {siteConfig.trialDays} dias.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                O Mercado Livre decide cada caso: a maanu avisa, organiza as provas e só envia o que você confirmar. O Recuperador
                vem em todos os planos e no teste grátis.
              </p>
            </div>
            <SiteButton href={signupHref} variant="teal" size="lg" className="shrink-0">
              Testar grátis por {siteConfig.trialDays} dias
            </SiteButton>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

function Scene({
  title,
  text,
  bullets,
  visual,
  flip = false,
}: {
  title: string
  text: string
  bullets?: string[]
  visual: ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
      <Reveal className={cn("lg:col-span-5", flip ? "lg:order-2 lg:col-start-8" : "lg:col-start-1")}>
        <h3 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.025em] text-balance sm:text-4xl">{title}</h3>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-white/75">{text}</p>
        {bullets ? (
          <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-white/90">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5">
                <CheckIcon className="mt-1 size-4 shrink-0 text-brand-mint" aria-hidden />
                {bullet}
              </li>
            ))}
          </ul>
        ) : null}
      </Reveal>
      <Reveal delay={120} className={cn("lg:col-span-7", flip ? "lg:order-1" : "lg:col-start-6")}>
        {visual}
      </Reveal>
    </div>
  )
}