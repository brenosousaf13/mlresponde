import { ArrowRightIcon, GaugeIcon, OctagonPauseIcon, StoreIcon } from "lucide-react"
import Link from "next/link"

import { ConnectMlDialog } from "@/components/contas/connect-ml-dialog"
import { buttonVariants } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import type { AnswersUsageNotice, MlConnectionNotice } from "@/lib/access/notices"
import { cn } from "@/lib/utils"

/**
 * Avisos no topo do conteúdo de todas as páginas: conta do Mercado Livre (até existir uma conta ativa) e pausa
 * geral da IA ligada pela equipe. O aviso do teste grátis fica no menu lateral (components/app/trial-status.tsx).
 */
export function AccountNotices({
  ml,
  canManage,
  platformAiPaused = false,
  usage = null,
}: {
  ml: MlConnectionNotice | null
  /** Limite de respostas automáticas do plano perto do fim (80%) ou esgotado. */
  usage?: AnswersUsageNotice | null
  /** Só dono/administrador conecta contas; os outros membros vão para a página de contas. */
  canManage: boolean
  /** Pausa geral da IA ligada pela equipe maanu (painel do administrador). */
  platformAiPaused?: boolean
}) {
  if (!ml && !platformAiPaused && !usage) return null
  return (
    <section aria-label="Avisos da conta" className="flex flex-col gap-3">
      {usage ? (
        <Item variant="outline" className="bg-card shadow-xs">
          <ItemMedia
            className={cn(
              "size-10 rounded-lg",
              usage.level === "reached" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"
            )}
          >
            <GaugeIcon className="size-5" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="line-clamp-none">{usage.title}</ItemTitle>
            <ItemDescription className="line-clamp-none">{usage.description}</ItemDescription>
          </ItemContent>
          <ItemActions className="max-sm:w-full max-sm:pl-12.5">
            <Link
              href="/assinatura"
              className={cn(buttonVariants({ variant: usage.level === "reached" ? "default" : "outline", size: "sm" }))}
            >
              {canManage ? "Ver planos" : "Ver uso"}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </ItemActions>
        </Item>
      ) : null}
      {platformAiPaused ? (
        <Item variant="outline" className="bg-card shadow-xs">
          <ItemMedia className="size-10 rounded-lg bg-amber-500/10 text-amber-600">
            <OctagonPauseIcon className="size-5" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="line-clamp-none">Respostas automáticas pausadas pela equipe maanu</ItemTitle>
            <ItemDescription className="line-clamp-none">
              É uma manutenção temporária. Enquanto isso, as perguntas novas ficam para você responder.
            </ItemDescription>
          </ItemContent>
          <ItemActions className="max-sm:w-full max-sm:pl-12.5">
            <Link href="/perguntas?aba=responder" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Ver perguntas
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </ItemActions>
        </Item>
      ) : null}
      {ml ? (
        <Item variant="outline" className="bg-card shadow-xs">
          <ItemMedia className="relative size-10 rounded-lg bg-brand-sage text-brand-teal-ink">
            <StoreIcon className="size-5" />
            {/* Ponto âmbar = algo esperando você (mesma cor das pendências nas outras telas). */}
            <span className="absolute -top-1 -right-1 flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-3 rounded-full border-2 border-card bg-amber-500" />
            </span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="line-clamp-none">{ml.title}</ItemTitle>
            <ItemDescription className="line-clamp-none">
              {ml.kind === "connect" && !canManage
                ? "Peça ao dono da loja para conectar a conta do Mercado Livre e liberar a plataforma."
                : ml.description}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="max-sm:w-full max-sm:pl-12.5">
            {ml.kind === "connect" && canManage ? (
              <ConnectMlDialog label="Conectar agora" size="sm" />
            ) : (
              <Link href="/contas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Ver contas
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            )}
          </ItemActions>
        </Item>
      ) : null}
    </section>
  )
}
