"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "todas"

export function AccountFilter({ accounts }: { accounts: { id: string; nickname: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get("conta") ?? ALL
  const items = [{ value: ALL, label: "Todas as contas" }, ...accounts.map((a) => ({ value: a.id, label: a.nickname }))]

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString())
        if (!value || value === ALL) params.delete("conta")
        else params.set("conta", String(value))
        params.delete("pagina")
        const query = params.toString()
        router.push(query ? `${pathname}?${query}` : pathname)
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por conta">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
