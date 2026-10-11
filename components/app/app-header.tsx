"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { PAGE_TITLES } from "@/lib/navigation"

export function AppHeader() {
  const pathname = usePathname()
  const title =
    Object.entries(PAGE_TITLES).find(
      ([href]) => pathname === href || pathname.startsWith(`${href}/`)
    )?.[1] ?? ""

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
      <h1 className="text-sm font-medium">{title}</h1>
    </header>
  )
}
