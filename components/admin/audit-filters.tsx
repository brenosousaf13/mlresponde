"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AUDIT_FILTERS } from "@/lib/admin/labels"
import { cn } from "@/lib/utils"

const ALL = "tudo"

/** Filtro do histórico por tipo de ação (?tipo=). */
export function AuditFilters({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const items = [{ value: ALL, label: "Tudo" }, ...AUDIT_FILTERS]

  return (
    <ToggleGroup
      value={[value || ALL]}
      onValueChange={(next) => {
        const choice = next[0]
        if (!choice) return
        const params = new URLSearchParams(searchParams.toString())
        if (choice === ALL) params.delete("tipo")
        else params.set("tipo", choice)
        params.delete("pagina")
        const query = params.toString()
        startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
      }}
      variant="outline"
      spacing={0}
      aria-label="Tipo de ação"
      className={cn("flex-wrap bg-card", pending && "opacity-70")}
    >
      {items.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value} className="px-3 aria-pressed:bg-primary/10 aria-pressed:text-primary">
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
