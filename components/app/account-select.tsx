"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "todas"

/** Troca a conta do Mercado Livre pelo parâmetro ?conta= (com opção "Todas as contas" quando allowAll). */
export function AccountSelect({
  accounts,
  value,
  allowAll = false,
  resetParams = ["pagina", "q"],
}: {
  accounts: { id: string; nickname: string }[]
  value?: string | null
  allowAll?: boolean
  resetParams?: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = value ?? searchParams.get("conta") ?? (allowAll ? ALL : accounts[0]?.id)
  const items = [
    ...(allowAll ? [{ value: ALL, label: "Todas as contas" }] : []),
    ...accounts.map((account) => ({ value: account.id, label: account.nickname })),
  ]

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString())
        if (!next || next === ALL) params.delete("conta")
        else params.set("conta", String(next))
        for (const key of resetParams) params.delete(key)
        const query = params.toString()
        router.push(query ? `${pathname}?${query}` : pathname)
      }}
    >
      <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Conta do Mercado Livre">
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
