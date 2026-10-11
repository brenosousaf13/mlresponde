"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PERIOD_OPTIONS, type PeriodDays } from "@/lib/results/metrics"
import { cn } from "@/lib/utils"

/** Troca o período pelo parâmetro ?periodo= (7, 30 ou 90 dias). */
export function PeriodToggle({ value }: { value: PeriodDays }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  return (
    <ToggleGroup
      value={[String(value)]}
      onValueChange={(next) => {
        const choice = next[0]
        if (!choice || choice === String(value)) return
        const params = new URLSearchParams(searchParams.toString())
        params.set("periodo", choice)
        startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
      }}
      variant="outline"
      spacing={0}
      aria-label="Período"
      className={cn("bg-card", pending && "opacity-70")}
    >
      {PERIOD_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="px-3 aria-pressed:bg-primary/10 aria-pressed:text-primary"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}