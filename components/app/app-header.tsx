"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { PAGE_TITLES } from "@/lib/navigation"

/**
 * Barra de topo só no celular: lá o menu é uma gaveta e precisa de um botão para abrir.
 * No computador o botão de recolher fica na própria barra lateral (e cada página já tem seu título).
 */
export function AppHeader() {
  const pathname = usePathname()
  const title =
    Object.entries(PAGE_TITLES).find(
      ([href]) => pathname === href || pathname.startsWith(`${href}/`)
    )?.[1] ?? ""

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4 md:hidden">
      <SidebarTrigger className="-ml-1" aria-label="Abrir menu" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
      <h1 className="text-sm font-medium">{title}</h1>
    </header>
  )
}
