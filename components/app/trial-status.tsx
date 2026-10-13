"use client"

import { ArrowRightIcon, CircleAlertIcon } from "lucide-react"
import Link from "next/link"

import { TrialRing } from "@/components/app/trial-ring"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import type { TrialNotice } from "@/lib/access/notices"
import { cn } from "@/lib/utils"

function NoticeMedia({ notice, className }: { notice: TrialNotice; className?: string }) {
  if (notice.kind === "trial") {
    return <TrialRing daysLeft={notice.daysLeft} remaining={notice.remaining} urgent={notice.urgent} className={className} />
  }
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive",
        className
      )}
      aria-hidden
    >
      <CircleAlertIcon className="size-4.5!" />
    </span>
  )
}

/**
 * Situação do teste grátis no rodapé do menu lateral (fica visível em todas as páginas).
 * Menu aberto: cartão com o anel dos dias e "Ver planos". Menu recolhido: só o anel, com o texto na dica.
 */
export function SidebarTrialStatus({ notice }: { notice: TrialNotice }) {
  const ended = notice.kind === "ended"
  const strong = ended || notice.urgent
  return (
    <>
      <Card
        size="sm"
        className={cn(
          "gap-3 shadow-xs group-data-[collapsible=icon]:hidden",
          ended && "ring-destructive/25"
        )}
      >
        <CardContent className="flex items-center gap-3">
          <NoticeMedia notice={notice} />
          <div className="grid min-w-0 flex-1 gap-0.5 leading-tight">
            <span className="line-clamp-2 text-sm font-medium">{notice.title}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{notice.detail}</span>
          </div>
        </CardContent>
        <CardContent>
          <Link
            href="/assinatura"
            className={cn(buttonVariants({ variant: strong ? "default" : "outline", size: "sm" }), "w-full")}
          >
            {ended ? "Assinar um plano" : "Ver planos"}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </CardContent>
      </Card>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip={`${notice.title} · ${notice.detail}`}
            render={<Link href="/assinatura" />}
            className="justify-center"
          >
            <NoticeMedia notice={notice} className="size-8" />
            <span className="sr-only">{notice.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}

/** Mesma informação no topo do celular, onde o menu lateral fica escondido. */
export function HeaderTrialStatus({ notice }: { notice: TrialNotice }) {
  const ended = notice.kind === "ended"
  return (
    <Link
      href="/assinatura"
      aria-label={`${notice.title}. ${notice.detail}`}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "ml-auto h-8 gap-2 rounded-full pr-3 pl-1",
        ended && "border-destructive/30 text-destructive hover:text-destructive"
      )}
    >
      <NoticeMedia notice={notice} className="size-6 [&>span]:text-[0.65rem]" />
      {notice.short}
    </Link>
  )
}
