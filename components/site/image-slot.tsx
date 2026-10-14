import { Image as ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Espaço reservado para uma imagem que ainda vai ser produzida (print do app, foto, ilustração).
 * Troque por <Image> do next/image quando o arquivo existir; o rótulo diz o que vai em cada lugar.
 */
export function ImageSlot({
  label,
  hint,
  tone = "light",
  className,
}: {
  label: string
  /** Tamanho recomendado ou orientação para quem vai produzir a imagem. */
  hint?: string
  tone?: "light" | "dark"
  className?: string
}) {
  const dark = tone === "dark"
  return (
    <div
      role="img"
      aria-label={`Espaço reservado para imagem: ${label}`}
      className={cn(
        "relative isolate flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center",
        dark ? "border-white/20 bg-white/[0.04] text-white/75" : "border-brand-teal/35 bg-brand-sage/45 text-brand-teal-ink",
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10 opacity-60",
          dark
            ? "bg-[repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_oklch,white_5%,transparent)_14px_15px)]"
            : "bg-[repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_oklch,var(--brand-teal)_14%,transparent)_14px_15px)]"
        )}
      />
      <span
        className={cn(
          "grid size-11 place-items-center rounded-xl shadow-sm",
          dark ? "bg-white/10 text-white" : "bg-white text-brand-teal-ink"
        )}
      >
        <ImageIcon className="size-5" aria-hidden />
      </span>
      <span className="font-mono text-[10px] font-medium tracking-[0.2em] uppercase opacity-80">Imagem</span>
      <span className="max-w-xs text-sm leading-snug font-medium text-balance">{label}</span>
      {hint ? <span className="max-w-xs text-xs leading-snug opacity-70 text-balance">{hint}</span> : null}
    </div>
  )
}
