"use client"

import {
  BotIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LockIcon,
  MessageCircleQuestionIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings2Icon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { LogoIcon } from "@/components/brand/logo"
import { NavUser } from "@/components/app/nav-user"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { siteConfig } from "@/lib/config/site"
import type { NavItemConfig } from "@/lib/navigation"

const ICONS: Record<NavItemConfig["icon"], LucideIcon> = {
  painel: LayoutDashboardIcon,
  perguntas: MessageCircleQuestionIcon,
  assistente: BotIcon,
  contas: StoreIcon,
  assinatura: CreditCardIcon,
  configuracoes: Settings2Icon,
}

export type SidebarNavItem = NavItemConfig & { lockedReason?: string; badge?: number }

export function AppSidebar({
  items,
  user,
  organizationName,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  items: SidebarNavItem[]
  user: { name: string; email: string; isPlatformAdmin?: boolean }
  organizationName: string
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand organizationName={organizationName} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {items.map((item) => {
              const Icon = ICONS[item.icon]
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              if (item.lockedReason) {
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      aria-disabled
                      tooltip={`${item.title} — ${item.lockedReason}`}
                      className="cursor-not-allowed opacity-50 hover:bg-transparent"
                      title={item.lockedReason}
                    >
                      <Icon />
                      <span>{item.title}</span>
                      <LockIcon className="ml-auto" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <Icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge ? (
                    <SidebarMenuBadge className="bg-brand-yellow text-brand-navy">
                      {item.badge > 99 ? "99+" : item.badge}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail aria-label="Recolher ou abrir o menu" title="Recolher ou abrir o menu" />
    </Sidebar>
  )
}

/**
 * Topo da barra lateral: marca + botão de recolher na própria barra.
 * Recolhida, a logo vira o botão de abrir (o ícone aparece ao passar o mouse).
 */
function SidebarBrand({ organizationName }: { organizationName: string }) {
  const { state, isMobile, toggleSidebar } = useSidebar()
  const logo = (
    <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/10">
      <LogoIcon className="size-6" />
    </span>
  )

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Abrir menu (Ctrl + B)"
            aria-label="Abrir menu"
            onClick={toggleSidebar}
            className="group/brand relative"
          >
            <span className="transition-opacity group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0">{logo}</span>
            <span className="absolute inset-0 flex items-center justify-center text-sidebar-foreground/70 opacity-0 transition-opacity group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100">
              <PanelLeftOpenIcon />
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const closeLabel = isMobile ? "Fechar menu" : "Recolher menu"
  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-1">
        <SidebarMenuButton size="lg" render={<Link href="/painel" />} className="min-w-0 flex-1">
          {logo}
          <span className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{siteConfig.name}</span>
            <span className="truncate text-xs text-muted-foreground">{organizationName}</span>
          </span>
        </SidebarMenuButton>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={closeLabel}
                onClick={toggleSidebar}
                className="shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              />
            }
          >
            <PanelLeftCloseIcon />
          </TooltipTrigger>
          <TooltipContent side="right" hidden={isMobile}>
            {closeLabel} (Ctrl + B)
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
