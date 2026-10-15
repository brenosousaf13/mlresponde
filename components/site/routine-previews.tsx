import { Check, Copy, UserRound } from "lucide-react"
import type { ReactNode } from "react"

import { LogoMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

/**
 * Telas da maanu desenhadas em código para a seção "No dia a dia" da página de vendas.
 * Dados de exemplo (nenhum é de cliente). Cores com o mesmo significado do app: teal = IA, âmbar = esperando você.
 */

export function PreviewWindow({ screen, children, className }: { screen: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "site-clip rounded-2xl border border-border bg-white text-brand-graphite shadow-[0_30px_70px_-40px] shadow-slate-900/40",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs">
        <LogoMark label="" className="h-2.5" />
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{screen}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

const INBOX_TABS = [
  { label: "Respondidas pela IA", count: 37, active: true },
  { label: "Por você", count: 4 },
  { label: "Para responder", count: 2, waiting: true },
] as const

const INBOX_ROWS = [
  { question: "Tem na cor azul escuro? Uso 40.", item: "Kit 3 calças jeans femininas", time: "23:47", ai: true },
  { question: "Envia hoje se eu comprar agora?", item: "Fone Bluetooth com cancelamento de ruído", time: "02:13", ai: true },
  { question: "É 110 ou 220? Moro em Recife.", item: "Air fryer 5 litros", time: "06:58", ai: true },
  { question: "Faz por R$ 200 no Pix?", item: "Ventilador de mesa 40 cm", time: "09:02", ai: false },
] as const

export function InboxPreview() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {INBOX_TABS.map((tab) => (
          <div
            key={tab.label}
            className={cn(
              "rounded-xl border px-3 py-2",
              "active" in tab ? "border-brand-teal/40 bg-brand-sage/70" : "border-border"
            )}
          >
            <p className={cn("truncate text-[11px]", "active" in tab ? "text-brand-teal-ink" : "text-muted-foreground")}>{tab.label}</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-display text-xl font-semibold tabular-nums">
              {tab.count}
              {"waiting" in tab ? <span className="size-1.5 rounded-full bg-amber-500" /> : null}
            </p>
          </div>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {INBOX_ROWS.map((row) => (
          <li key={row.question} className="flex items-center gap-3 px-3 py-2.5">
            <span className={cn("size-2 shrink-0 rounded-full", row.ai ? "bg-brand-teal" : "bg-amber-500")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.question}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.item}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-[11px] text-muted-foreground">{row.time}</span>
              <span className={cn("block text-[11px] font-medium", row.ai ? "text-brand-teal-ink" : "text-amber-700")}>
                {row.ai ? "Respondida pela IA" : "Sugestão pronta"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TeachPreview() {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <UserRound className="size-4" />
        </span>
        <div>
          <p className="rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2">Qual o prazo para fabricar?</p>
          <p className="mt-1 pl-1 text-xs text-muted-foreground">Kit 3 calças jeans femininas</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Resposta da IA</p>
        <p className="mt-1 text-muted-foreground line-through decoration-slate-400">
          Olá! O prazo aparece na página do anúncio.
        </p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Sua resposta</p>
        <p className="mt-1 rounded-xl border border-brand-teal/50 bg-white px-3.5 py-3 leading-relaxed ring-3 ring-brand-teal/15">
          Olá! Fabricamos em até 3 dias úteis e enviamos no mesmo dia. Boas compras!
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="grid size-4 place-items-center rounded-[5px] bg-brand-teal text-white">
            <Check className="size-3" />
          </span>
          Ensinar a IA
        </span>
        <span className="rounded-full bg-brand-graphite px-4 py-1.5 text-xs font-semibold text-white">Enviar resposta</span>
      </div>

      <p className="rounded-xl bg-brand-sage/70 px-3.5 py-2.5 text-[13px] text-brand-teal-ink">
        Pronto. Ela usa esse exemplo nas próximas perguntas parecidas.
      </p>
    </div>
  )
}

const ORDER_STEPS = [
  { label: "Pago", done: true },
  { label: "Enviado", done: true },
  { label: "A caminho", current: true },
  { label: "Entregue" },
] as const

export function AfterSalePreview() {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-border p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-medium">Kit 3 calças jeans femininas</p>
          <span className="shrink-0 rounded-full bg-brand-sage px-2.5 py-0.5 text-[11px] font-semibold text-brand-teal-ink">
            A caminho
          </span>
        </div>
        <ol className="mt-3.5 grid grid-cols-4 gap-1.5">
          {ORDER_STEPS.map((step) => (
            <li key={step.label}>
              <span
                className={cn(
                  "block h-1 rounded-full",
                  "done" in step ? "bg-brand-teal" : "current" in step ? "bg-brand-teal/50" : "bg-slate-200"
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block text-[11px]",
                  "current" in step ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2.5 text-xs text-muted-foreground">Previsão de entrega: quinta, 17/10</p>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <UserRound className="size-4" />
        </span>
        <p className="rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2">Cadê meu pedido? Comprei segunda.</p>
      </div>
      <div className="flex items-start justify-end gap-2.5">
        <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-graphite px-3.5 py-2.5 leading-relaxed text-white">
          Oi! Seu pedido já saiu e está a caminho, com previsão de entrega na quinta, 17/10. Qualquer coisa, é só chamar por
          aqui!
        </p>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-graphite">
          <LogoMark label="" className="h-2.5 text-white" />
        </span>
      </div>
    </div>
  )
}

const SIZES = [
  "Tamanho 38: cintura 72 cm, quadril 98 cm",
  "Tamanho 40: cintura 76 cm, quadril 102 cm",
  "Tamanho 42: cintura 80 cm, quadril 106 cm",
] as const

export function ImprovementsPreview() {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">Kit 3 calças jeans femininas</p>
          <p className="text-xs text-muted-foreground">40 perguntas analisadas</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-display text-2xl leading-none font-semibold tabular-nums">18 de 40</span>
          <span className="text-xs text-muted-foreground">eram sobre medidas</span>
        </p>
      </div>

      <div className="rounded-xl border border-border p-3.5">
        <p className="font-medium">Coloque a tabela de medidas na descrição</p>
        <div className="mt-2.5 space-y-1 rounded-lg bg-slate-50 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-700">
          {SIZES.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium">
          <Copy className="size-3.5" />
          Copiar texto
        </span>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Perguntas sobre medidas por semana</p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs text-muted-foreground">Antes</span>
            <span className="h-2 w-[90%] rounded-full bg-slate-300" />
            <span className="w-4 font-mono text-xs tabular-nums">9</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs text-muted-foreground">Depois</span>
            <span className="h-2 w-[30%] rounded-full bg-brand-teal" />
            <span className="w-4 font-mono text-xs tabular-nums">3</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const ACCOUNTS = [
  { name: "LOJA_CENTRO", mode: "Responder sempre", on: true, detail: "412 respostas no mês" },
  { name: "LOJA_OUTLET", mode: "Rigor equilibrado", on: true, detail: "268 respostas no mês" },
  { name: "LOJA_KIDS", mode: "Rigor cauteloso", on: false, detail: "você responde" },
] as const

export function AccountsPreview() {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">Contas do Mercado Livre</p>
        <p className="font-mono text-xs text-muted-foreground">3 de 10</p>
      </div>
      <ul className="mt-3 space-y-2">
        {ACCOUNTS.map((account) => (
          <li key={account.name} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[13px] font-medium">{account.name}</span>
              <span className="block text-xs text-muted-foreground">{account.mode}</span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium",
                  account.on ? "text-brand-teal-ink" : "text-slate-500"
                )}
              >
                <span className={cn("size-1.5 rounded-full", account.on ? "bg-brand-teal" : "bg-slate-400")} />
                {account.on ? "IA ligada" : "IA pausada"}
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground">{account.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Cada conta com as próprias regras, o próprio tom e os próprios anúncios bloqueados.
      </p>
    </div>
  )
}
