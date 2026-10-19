"use client"

import { useRouter } from "next/navigation"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Ordem da lista de clientes: cada opção leva ao seu endereço (o estado da lista vive na URL). */
export function OrderSelect({
  value,
  options,
}: {
  value: string
  options: { value: string; label: string; hint: string; href: string }[]
}) {
  const router = useRouter()
  const items = options.map((option) => ({ value: option.value, label: option.label }))
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next)
        if (option) router.push(option.href, { scroll: false })
      }}
    >
      <SelectTrigger className="w-full bg-card sm:w-48" aria-label="Ordenar clientes">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
