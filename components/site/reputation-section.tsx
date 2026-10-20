import {
  BellRing,
  CalendarClock,
  Clock,
  HandCoins,
  Mail,
  MessageSquareWarning,
  Sparkles,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { siteConfig } from "@/lib/config/site"
import { thresholdsCheckedLabel } from "@/lib/site/reputation-demo"
import { cn } from "@/lib/utils"

import { Container, SectionTitle } from "./primitives"
import { CountUpBRL, LiveCountdown } from "./reputation-live"
import { ReputationSimulator } from "./reputation-simulator"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

/**
 * Escudo de Reputação na página de vendas: simulador do termômetro (regras oficiais, as mesmas do app) e as telas do
 * Escudo desenhadas em código. Dados de exemplo; nenhum é de cliente. Cores do termômetro = as do ML, não da marca.
 */

const PANEL = "rounded-2xl border border-white/10 bg-brand-night/70 p-4 shadow-[0_24px_50px_-30px] shadow-black/70"

/** Linhas comuns (subgrid): rótulo, tela e texto ficam na mesma altura nos cartões lado a lado. */
const SUBGRID = "row-span-3 grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid gap-y-0"

function FeatureCard({
  icon: CardIcon,
  label,
  title,
  text,
  delay,
  children,
}: {
  icon: LucideIcon
  label: string
  title: string
  text: string
  delay?: number
  children: ReactNode
}) {
  return (
    <Reveal delay={delay} className={SUBGRID}>
      <article
        className={cn(
          SUBGRID,
          "rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-white/20 sm:p-7"
        )}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-white/80">
          <CardIcon className="size-4 text-brand-mint" aria-hidden />
          {label}
        </p>
        <div aria-hidden className="mt-5">
          {children}
        </div>
        <div className="pt-7">
          <h3 className="font-display text-xl leading-snug font-semibold tracking-tight text-balance">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-white/60">{text}</p>
        </div>
      </article>
    </Reveal>
  )
}

function Tag({ tone, children }: { tone: "risk" | "ok" | "bad"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "risk" && "bg-amber-400/15 text-amber-300",
        tone === "ok" && "bg-emerald-400/15 text-emerald-300",
        tone === "bad" && "bg-red-400/15 text-red-300"
      )}
    >
      {children}
    </span>
  )
}

const SHIPMENTS = [
  { item: "Kit 3 calças jeans femininas", due: "amanhã, 12:00" },
  { item: "Air fryer 5 litros", due: "sexta, 18:00" },
] as const

function ShipmentsPreview() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className={cn(PANEL, "flex flex-1 flex-col gap-3 text-sm")}>
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium leading-snug">Tênis de corrida masculino</p>
            <Tag tone="risk">Em risco</Tag>
          </div>
          <p className="mt-1 text-xs text-white/55">Prazo de despacho: hoje</p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-sm text-amber-300">
            <Clock className="size-3.5" aria-hidden />
            faltam <LiveCountdown seconds={2 * 3600 + 14 * 60 + 37} />
          </p>
        </div>
        {SHIPMENTS.map((shipment) => (
          <div key={shipment.item} className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="truncate font-medium">{shipment.item}</p>
              <p className="text-xs text-white/50">Despachar até {shipment.due}</p>
            </div>
            <Tag tone="ok">No prazo</Tag>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-brand-mint">
          <span className="site-motion absolute inset-0 animate-[site-ping_2.4s_ease-out_infinite] rounded-full bg-brand-teal/25" />
          <Mail className="relative size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">Alerta enviado por e-mail</span>
          <span className="block text-xs text-white/55">1 envio vence em menos de 4 horas</span>
        </span>
      </div>
    </div>
  )
}

function ClaimPreview() {
  return (
    <div className={cn(PANEL, "flex h-full flex-col text-sm")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-white/55">Reclamação · produto com defeito</p>
        <Tag tone="bad">Afeta a reputação</Tag>
      </div>
      <p className="mt-2 leading-snug">“A alça da bolsa chegou descosturada.”</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
        <Clock className="size-3.5" />
        Sua resposta vence em 18 horas
      </p>
      <div className="mt-3 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-mint uppercase">
          <Sparkles className="size-3.5" />
          Melhor saída, segundo a IA
        </p>
        <p className="mt-1 font-medium">Reembolso parcial de R$ 30</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60 italic">
          “Olá! Sentimos muito pela alça. Podemos devolver R$ 30 e você fica com a bolsa…”
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-3 text-xs font-semibold">
        <span className="rounded-full bg-white px-3 py-1.5 text-brand-graphite">Revisar e enviar</span>
        <span className="rounded-full border border-white/15 px-3 py-1.5 text-white/75">Editar o texto</span>
      </div>
    </div>
  )
}

const COLOR_ROWS = [
  { label: "Verde", detail: "até 50% de desconto", width: "100%", bar: "bg-emerald-500" },
  { label: "Amarelo", detail: "até 40%", width: "80%", bar: "bg-yellow-400" },
  { label: "Laranja ou vermelho", detail: "sem desconto", width: "3%", bar: "bg-red-500" },
] as const

function ColorValuePreview() {
  return (
    <div className={cn(PANEL, "flex h-full flex-col")}>
      <p className="text-xs text-white/55">O ML descontou do seu frete em 30 dias</p>
      <p className="mt-1 font-display text-4xl leading-none font-semibold tracking-[-0.03em] text-emerald-300">
        <CountUpBRL value={1284} />
      </p>
      <p className="mt-2 text-xs text-white/55">No laranja, você pagaria até esse valor a mais por mês.</p>
      <ul className="mt-auto flex flex-col gap-2.5 pt-4 text-xs">
        {COLOR_ROWS.map((row) => (
          <li key={row.label}>
            <span className="flex justify-between gap-2">
              <span className="font-medium text-white/85">{row.label}</span>
              <span className="text-white/55">{row.detail}</span>
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-white/10">
              <span className={cn("block h-full rounded-full", row.bar)} style={{ width: row.width }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const FORECAST = [
  { date: "23 de novembro", text: "sai 1 reclamação · 3 continuam contando" },
  { date: "5 de dezembro", text: "saem 2 reclamações · 1 continua contando" },
  { date: "9 de dezembro", text: "sai 1 reclamação · nenhuma continua contando" },
] as const

function ForecastPreview() {
  return (
    <div className={cn(PANEL, "flex h-full flex-col text-sm")}>
      <p className="text-xs text-white/55">Quando as reclamações saem da conta</p>
      <ol className="mt-3 ml-1 flex flex-col gap-3 border-l border-white/15">
        {FORECAST.map((step) => (
          <li key={step.date} className="relative pl-4">
            <span className="absolute top-1.5 -left-[4.5px] size-2 rounded-full bg-brand-mint shadow-[0_0_10px] shadow-brand-mint/60" />
            <span className="block font-medium">{step.date}</span>
            <span className="block text-xs text-white/55">{step.text}</span>
          </li>
        ))}
      </ol>
      <span className="block min-h-4 flex-1" />
      <p className="mt-auto flex items-center gap-2 rounded-xl border border-dashed border-brand-mint/35 px-3 py-2 text-xs text-brand-mint">
        <Sparkles className="size-3.5 shrink-0" />
        Possível exclusão: pedido ao ML já escrito
      </p>
    </div>
  )
}

const PROMISES: readonly { id: string; icon: LucideIcon; text: ReactNode }[] = [
  { id: "aprova", icon: Sparkles, text: "A IA prepara, você aprova. Nada sai sozinho." },
  { id: "clique", icon: HandCoins, text: "Reembolso, devolução e mediação só com o seu clique." },
  {
    id: "alerta",
    icon: BellRing,
    text: (
      <>
        Alerta urgente na hora, no app e por <span className="whitespace-nowrap">e-mail.</span>
      </>
    ),
  },
]

export function ReputationSection({ signupHref }: { signupHref: string }) {
  return (
    <section id="reputacao" aria-labelledby="reputacao-title" className="scroll-mt-24 px-3 sm:px-4">
      <div className="relative isolate site-clip rounded-[2rem] bg-brand-night py-20 text-white sm:rounded-[2.75rem] sm:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-motion absolute -top-1/4 -right-1/4 h-[70%] w-[60%] animate-[site-aurora_20s_ease-in-out_infinite] rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="site-motion absolute -bottom-1/4 -left-1/4 h-[70%] w-[60%] animate-[site-aurora_24s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_40%,transparent),transparent)] blur-2xl" />
          <div className="site-grid absolute inset-0" />
          <div className="site-grain absolute inset-0" />
        </div>

        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2.5 rounded-full border border-brand-teal/30 bg-brand-teal/10 py-1.5 pr-4 pl-3 text-sm font-medium text-brand-mint">
              <span className="relative flex size-2" aria-hidden>
                <span className="site-motion absolute inset-0 animate-[site-ping_1.8s_ease-out_infinite] rounded-full bg-brand-mint" />
                <span className="relative size-2 rounded-full bg-brand-mint" />
              </span>
              Novo · Escudo de Reputação
            </p>
            <SectionTitle id="reputacao-title" className="mt-6">
              Cair de cor custa caro. <span className="site-gradient-text">Agora sua reputação tem escudo.</span>
            </SectionTitle>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-white/70">
              No Mercado Livre, a cor do termômetro decide quanto você paga de frete, se pode usar o Flex e anunciar, e onde
              seus anúncios aparecem. A {siteConfig.name} vigia essa cor por você: mostra quanto falta para cair, avisa do envio
              perto do prazo e prepara com IA a resposta de cada reclamação.
            </p>
          </Reveal>

          {/*
            Celular: um embaixo do outro. Tablet e notebook: simulador inteiro e os 4 cartões em 2×2. Tela grande: 3 colunas,
            com o simulador ao lado dos despachos (a linha do meio, das telas, absorve a diferença de altura).
          */}
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-[auto_1fr_auto]">
            <Reveal className="h-full md:col-span-2 xl:row-span-3">
              <ReputationSimulator />
            </Reveal>
            <FeatureCard
              delay={100}
              icon={Truck}
              label="Despacho perto do prazo"
              title="Nenhum envio passa do prazo sem você saber."
              text="A maanu confere seus envios várias vezes por hora e avisa antes de vencer, para o atraso não chegar ao termômetro."
            >
              <ShipmentsPreview />
            </FeatureCard>
            <FeatureCard
              delay={60}
              icon={MessageSquareWarning}
              label="Reclamações com IA"
              title="Cada reclamação chega com a saída pronta."
              text="A IA lê a conversa, a venda e o envio, indica a melhor saída e escreve a resposta. Você revisa e aprova."
            >
              <ClaimPreview />
            </FeatureCard>
            <FeatureCard
              delay={140}
              icon={Wallet}
              label="Quanto vale a sua cor"
              title="Você vê em reais quanto a sua cor vale."
              text="A maanu soma o desconto de frete que o Mercado Livre deu para a sua cor e mostra quanto você pagaria a mais se ela caísse."
            >
              <ColorValuePreview />
            </FeatureCard>
            <FeatureCard
              delay={220}
              icon={CalendarClock}
              label="Previsão"
              title="Saiba o dia em que cada reclamação para de contar."
              text="A maanu mostra quanto de folga volta em cada data. Se a reclamação se encaixar nos casos de exclusão do ML, a IA avisa e deixa o pedido escrito."
            >
              <ForecastPreview />
            </FeatureCard>
          </div>

          <Reveal className="mt-14">
            <ul className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/10">
              {PROMISES.map(({ id, icon: PromiseIcon, text }) => (
                <li key={id} className="flex items-center gap-3 sm:flex-col sm:px-6 sm:text-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-brand-teal/30 bg-brand-teal/10 text-brand-mint">
                    <PromiseIcon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="text-[15px] leading-snug text-balance text-white/80">{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-12 flex flex-col items-center gap-3 text-center">
              <SiteButton href={signupHref} variant="teal" size="lg" className="max-sm:w-full">
                Proteger minha reputação
              </SiteButton>
              <p className="text-sm text-white/60">
                Incluído em todos os planos e no teste grátis de {siteConfig.trialDays} dias, sem cartão.
              </p>
            </div>
            <p className="mt-8 text-center text-xs text-white/45">
              Exemplos ilustrativos. Limites oficiais do Mercado Livre para o Brasil, conferidos em {thresholdsCheckedLabel()}.
            </p>
          </Reveal>
        </Container>
      </div>
    </section>
  )
}
