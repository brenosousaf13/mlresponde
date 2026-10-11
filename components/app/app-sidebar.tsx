"use client"

import {
  BotIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LockIcon,
  MessageCircleQuestionIcon,
  Settings2Icon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { LogoIcon } from "@/components/brand/logo"
import { NavUser } from "@/components/app/nav-user"
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
} from "@/components/ui/sidebar"
import { siteConfig } from "@/lib/config/site"
import type { NavItemConfig } from "@/lib/navigation"

const ICONS: Record<NavItemConfig["icon"], LucideIcon> = {
  painel: LayoutDashboardIcon,
  perguntas: MessageCircleQuestionIcon,
  respostas: BotIcon,
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
  user: { name: string; email: string }
  organizationName: string
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/painel" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary/10">
                <LogoIcon className="size-6" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{siteConfig.name}</span>
                <span className="truncate text-xs text-muted-foreground">{organizationName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarMenu>
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
      <SidebarRail />
    </Sidebar>
  )
}
