"use client"

import { BellRingIcon, CheckIcon, MailIcon, SparklesIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { LETTERS } from "./letters"
import { formatBRL } from "@/lib/site/calculator"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { CountUp } from "./count-up"
import { Headline } from "./headline"
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
    <div className="relative mx-auto w-full max-w-[24rem]" aria-hidden>
      <div className="relative aspect-square w-full">
        <svg viewBox="486 -8 112 116" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <clipPath id="u-clip">
              <path d={U_PATH} />
            </clipPath>
            <linearGradient id="u-liquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand-mint)" />
              <stop offset="1" stopColor="var(--brand-teal)" />
            </linearGradient>
          </defs>
          <path d={U_PATH} fill="rgb(255 255 255 / 0.06)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.8" />
          <g clipPath="url(#u-clip)">
            <rect x="480" y="-10" width="130" height="125" fill="url(#u-liquid)" className="u-liquid" />
          </g>
        </svg>
        <div className="absolute inset-0 [container-type:size]" style={{ "--fall": "74cqh" } as CSSProperties}>
          {coins.map((coin) => (
            <span
              key={coin.d}
              className="coin coin-fall site-motion"
              style={{ left: coin.x, top: "-4%", "--d": coin.d } as CSSProperties}
            >
              R$
            </span>
          ))}
        </div>
      </div>
      <div className="-mt-2 text-center">
        <p className="font-display text-5xl leading-none font-semibold tracking-[-0.04em] sm:text-6xl">
          <CountUp value={1247.3} format={formatBRL} duration={3000} />
        </p>
        <p className="mt-2 text-sm text-white/70">recuperados pela maanu na loja de demonstração</p>
      </div>
    </div>
  )
}

const SPOTS = [
  { left: "19.3%", width: "25.7%", caption: "Para recuperar agora", text: "Devoluções que chegaram e contestações liberadas, com o prazo para agir." },
  { left: "46%", width: "25.7%", caption: "Ficou para trás (90 dias)", text: "O Raio-X mostra o dinheiro que já foi para o comprador, e o que ainda dá para contestar." },
  { left: "72.7%", width: "25.8%", caption: "Recuperado pela maanu", text: "Só conta o que o Mercado Livre confirmou a seu favor." },
] as const

const ALERTS = [
  { tone: "red", title: "Chegou a devolução", body: "Fone Bluetooth sem fio · revise até amanhã, 14:40", tag: "Revise agora" },
  { tone: "amber", title: "Dá para contestar R$ 289,90", body: "O armazém do ML devolveu o dinheiro ao comprador · contestar até 23/10", tag: "Dá para contestar" },
  { tone: "teal", title: "Recuperado R$ 219,90", body: "O Mercado Livre deu razão a você na contestação da jaqueta jeans", tag: "Recuperado" },
] as const

export function RecoverSection({ signupHref }: { signupHref: string }) {
  return (
    <section
      id="recuperar"
      aria-labelledby="recuperar-title"
      data-nav="dark"
      className="relative isolate overflow-clip bg-[linear-gradient(180deg,#0a2a28_0%,#0c4a43_46%,#0e5f54_100%)] pre-pixel pt-8 text-white"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80" />
        <div className="site-motion absolute -top-32 -right-24 size-[46rem] animate-[site-aurora_22s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-mint)_38%,transparent),transparent)] blur-2xl" />
        <div className="site-motion absolute bottom-[-18rem] -left-40 size-[44rem] animate-[site-aurora_26s_ease-in-out_-8s_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_45%,transparent),transparent)] blur-2xl" />
        <div className="site-grain absolute inset-0" />
      </div>

      <Container className="max-w-7xl">
        {/* A: o diferencial, com a letra "u" juntando as moedas. */}
        <div className="grid grid-cols-1 items-center gap-12 pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-24">
          <div className="lg:col-span-7">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-mint/30 bg-brand-mint/10 py-1.5 pr-4 pl-1.5 text-sm text-brand-mint">
                <span className="rounded-full bg-brand-mint px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-graphite uppercase">Novo</span>
                Exclusivo da maanu · em todos os planos
              </p>
            </Reveal>
            <Headline
              id="recuperar-title"
              as="h2"
              dot="mint"
              className="mt-7 font-display text-[2.7rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-[5.4rem]"
            >
              O dinheiro que passou batido no Mercado Livre. <span className="text-brand-mint">Recupere</span>
            </Headline>
            <Reveal delay={120}>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-white/75 sm:text-xl">
                Quando uma devolução volta <b className="font-semibold text-white">sem condição de venda</b>, o armazém do Mercado Livre
                pode devolver o dinheiro ao comprador. Você até pode contestar, mas o prazo é curto e o aviso quase não aparece.
                O <b className="font-semibold text-white">Recuperador</b> lê cada devolução da sua conta, avisa na hora e ajuda você
                a contestar com motivo, relato e fotos.
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

        {/* B: a tela real, com os três números que importam acendendo um a um. */}
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
          <p className="mt-3 text-center text-xs text-white/50">Tela real da maanu com dados fictícios de demonstração.</p>
          <ul className="mx-auto mt-8 grid max-w-[70rem] grid-cols-1 gap-5 sm:grid-cols-3">
            {SPOTS.map((spot, index) => (
              <li key={spot.caption} className="cap-glow site-motion border-t border-white/20 pt-4" style={{ "--k": index } as CSSProperties}>
                <p className="font-mono text-xs tracking-wide text-brand-mint uppercase">0{index + 1}</p>
                <p className="mt-1.5 font-display text-xl font-semibold tracking-tight">{spot.caption}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/65">{spot.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* C: como funciona, em três cenas. */}
        <div id="recuperar-como" className="mt-28 flex scroll-mt-28 flex-col gap-24 sm:mt-40 sm:gap-36">
          <Scene
            n="01"
            title="Avisamos na hora, com o prazo"
            text="Quando a devolução chega até você, ou quando o armazém do Mercado Livre devolve o dinheiro ao comprador, a maanu avisa no app e por e-mail, com o valor e o prazo para agir."
            visual={
              <div className="relative mx-auto flex w-full max-w-md flex-col gap-3">
                {ALERTS.map((alert, index) => (
                  <div
                    key={alert.title}
                    className="alert-in site-motion flex items-start gap-3 rounded-2xl border border-white/12 bg-brand-night/70 p-4 backdrop-blur-xl"
                    style={{ "--k": index } as CSSProperties}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl",
                        alert.tone === "red" && "bg-red-500/15 text-red-300",
                        alert.tone === "amber" && "bg-amber-400/15 text-amber-300",
                        alert.tone === "teal" && "bg-brand-teal/20 text-brand-mint"
                      )}
                    >
                      <BellRingIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-white/60">{alert.body}</p>
                    </div>
                  </div>
                ))}
                <p className="mt-1 inline-flex items-center gap-2 text-xs text-white/60">
                  <MailIcon className="size-3.5 text-brand-mint" aria-hidden />
                  O mesmo aviso chega por e-mail, com o link direto para a devolução.
                </p>
              </div>
            }
          />
          <Scene
            flip
            n="02"
            title="Você resolve pelo celular, em 1 minuto"
            text="Chegou certinho? Um toque. Chegou com problema ou quer contestar o armazém? Escolha o motivo, tire as fotos e a IA escreve o relato. Nada vai ao Mercado Livre sem o seu clique."
            bullets={["Checklist e guia de fotos para cada motivo", "Relato escrito pela IA, que você edita", "Histórico de tudo o que foi enviado"]}
            visual={
              <div className="relative mx-auto w-fit">
                <Phone>
                  <Shot name="mobileDevolucoes" sizes="248px" className="h-full w-full object-cover object-top" />
                </Phone>
                <span className="absolute top-16 -left-10 hidden items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-brand-graphite shadow-xl sm:inline-flex site-motion [animation:site-float_6s_ease-in-out_infinite]">
                  <CheckIcon className="size-3.5 text-brand-teal" aria-hidden />
                  Chegou certinho: 1 toque
                </span>
                <span className="absolute -right-10 bottom-24 hidden items-center gap-2 rounded-full bg-brand-graphite px-3.5 py-2 text-xs font-semibold text-white shadow-xl ring-1 ring-white/15 sm:inline-flex site-motion [animation:site-float_7s_ease-in-out_-2s_infinite]">
                  <SparklesIcon className="size-3.5 text-brand-mint" aria-hidden />
                  Relato escrito pela IA
                </span>
              </div>
            }
          />
          <Scene
            n="03"
            title="O Raio-X procura o que ficou para trás"
            text="A maanu lê as devoluções dos últimos 90 dias e mostra onde o produto voltou sem condição de venda e o dinheiro foi para o comprador, com a força do argumento para contestar e o texto pronto para a Ajuda do ML."
            bullets={["Valor de cada achado, somado", "Argumento forte, vale contestar ou fraco", "Contestações em análise, acompanhadas"]}
            visual={
              <div className="shot-frame shot-frame-dark relative">
                <div className="h-[22rem] overflow-hidden sm:h-[26rem]">
                  <Shot name="recuperadorRaioX" sizes="(min-width: 1024px) 640px, 100vw" className="w-[150%] max-w-none sm:w-[135%]" />
                </div>
                <span className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-graphite shadow-xl">
                  R$ 639,70 dá para contestar
                </span>
              </div>
            }
          />
        </div>

        <Reveal className="mt-24 sm:mt-36">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.06] p-8 backdrop-blur-xl sm:p-12">
            <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-brand-mint/20 blur-3xl" />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
                  Deixe o Recuperador olhar as suas devoluções nos próximos {siteConfig.trialDays} dias.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-white/65">
                  O Mercado Livre decide cada caso: a maanu avisa, organiza as provas e só envia o que você confirmar. O Recuperador
                  vem em todos os planos e no teste grátis.
                </p>
              </div>
              <SiteButton href={signupHref} variant="teal" size="lg" className="shrink-0">
                Testar grátis por {siteConfig.trialDays} dias
              </SiteButton>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

function Scene({
  n,
  title,
  text,
  bullets,
  visual,
  flip = false,
}: {
  n: string
  title: string
  text: string
  bullets?: string[]
  visual: ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
      <Reveal className={cn("lg:col-span-5", flip ? "lg:order-2 lg:col-start-8" : "lg:col-start-1")}>
        <p className="font-mono text-sm text-brand-mint">{n}.</p>
        <h3 className="mt-3 font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{title}</h3>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-white/70">{text}</p>
        {bullets ? (
          <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-white/85">
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
        <div className="relative rounded-[2rem] border border-white/12 bg-white/[0.05] p-5 sm:p-9">{visual}</div>
      </Reveal>
    </div>
  )
}
