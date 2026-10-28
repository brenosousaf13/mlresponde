"use client"

import {
  ActivityIcon,
  ArrowLeftIcon,
  BotIcon,
  CircleDollarSignIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTransition } from "react"

import { signOut } from "@/app/(auth)/actions"
import { LogoMark, LogoWordmark } from "@/components/brand/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

type Item = { title: string; href: string; icon: LucideIcon; exact?: boolean }

const MONITOR: Item[] = [
  { title: "Visão geral", href: "/admin", icon: LayoutDashboardIcon, exact: true },
  { title: "Clientes", href: "/admin/clientes", icon: UsersIcon },
  { title: "Recuperador", href: "/admin/recuperador", icon: CircleDollarSignIcon },
  { title: "Uso de IA", href: "/admin/uso-ia", icon: BotIcon },
  { title: "Financeiro", href: "/admin/financeiro", icon: WalletIcon },
  { title: "Cobrança", href: "/admin/cobranca", icon: CreditCardIcon },
]

const CONTROL: Item[] = [
  { title: "Operação", href: "/admin/operacao", icon: ActivityIcon },
  { title: "Chaves de IA", href: "/admin/chaves-ia", icon: KeyRoundIcon },
  { title: "Auditoria", href: "/admin/auditoria", icon: ScrollTextIcon },
]

function hoursLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours} h`
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

export function AdminSidebar({
  user,
  sessionSecondsLeft,
  aiPaused,
  appHref,
}: {
  user: { name: string; email: string }
  sessionSecondsLeft: number
  aiPaused: boolean
  /** Endereço do app do cliente ("/painel", ou outro domínio quando o painel tem subdomínio próprio). */
  appHref: string
}) {
  const pathname = usePathname()

  const renderItems = (items: Item[]) =>
    items.map((item) => {
      const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton isActive={active} tooltip={item.title} render={<Link href={item.href} />}>
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
          {item.href === "/admin/operacao" && aiPaused ? (
            <SidebarMenuBadge className="bg-destructive font-semibold text-white">IA off</SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AdminBrand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Acompanhar</SidebarGroupLabel>
          <SidebarMenu className="gap-1">{renderItems(MONITOR)}</SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Controlar</SidebarGroupLabel>
          <SidebarMenu className="gap-1">{renderItems(CONTROL)}</SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Voltar para o app" render={<a href={appHref} />}>
                <ArrowLeftIcon />
                <span>Voltar para o app</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <AdminUser user={user} sessionSecondsLeft={sessionSecondsLeft} appHref={appHref} />
      </SidebarFooter>
      <SidebarRail aria-label="Recolher ou abrir o menu" title="Recolher ou abrir o menu" />
    </Sidebar>
  )
}

function AdminBrand() {
  const { state, isMobile, toggleSidebar } = useSidebar()

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Abrir menu (Ctrl + B)"
            aria-label="Abrir menu"
            onClick={toggleSidebar}
            className="group/brand relative justify-center"
          >
            <span className="flex size-8 items-center justify-center transition-opacity group-hover/brand:opacity-0">
              <LogoMark label="" className="h-3.5! w-auto! text-brand-offwhite" />
            </span>
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/brand:opacity-100">
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
        <SidebarMenuButton size="lg" render={<Link href="/admin" />} className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-1 flex-col gap-1 text-left leading-tight">
            <LogoWordmark className="h-[18px]! w-auto! self-start text-brand-offwhite" />
            <span className="flex items-center gap-1 text-xs font-medium tracking-wide text-brand-teal uppercase">
              <ShieldCheckIcon className="size-3!" />
              Administrador
            </span>
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

function AdminUser({
  user,
  sessionSecondsLeft,
  appHref,
}: {
  user: { name: string; email: string }
  sessionSecondsLeft: number
  appHref: string
}) {
  const { isMobile } = useSidebar()
  const [, startTransition] = useTransition()
  const initials = (user.name.trim() || user.email).slice(0, 2).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}>
            <Avatar>
              <AvatarFallback className="bg-brand-teal text-brand-graphite">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name || "Administrador"}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                <span className="text-sm font-medium text-foreground">{user.email}</span>
                <span className="text-xs text-muted-foreground">
                  Verificação em 2 etapas ativa · código pedido de novo em {hoursLabel(sessionSecondsLeft)}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<a href={appHref} />}>
              <ArrowLeftIcon />
              Voltar para o app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
              <LogOutIcon />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
