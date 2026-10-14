import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Lugar de um dado que o Breno ainda vai passar (CNPJ, WhatsApp...): fica visível e marcado até ser preenchido. */
export function Pending({ children, tone = "light", className }: { children: ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      title="A definir"
      className={cn(
        "inline-flex items-center rounded-md border border-dashed px-1.5 py-0.5 font-mono text-[0.8em]",
        tone === "dark" ? "border-white/30 text-white/70" : "border-brand-teal/50 text-brand-teal-ink",
        className
      )}
    >
      {children}
    </span>
  )
}

export function whatsappUrl(number: string, text?: string) {
  const query = text ? `?text=${encodeURIComponent(text)}` : ""
  return `https://wa.me/${number}${query}`
}
