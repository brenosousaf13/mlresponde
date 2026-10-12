import { cn } from "@/lib/utils"
import { siteConfig } from "@/lib/config/site"

import { MARK, WORDMARK } from "./logo-paths"

type LogoProps = {
  className?: string
  /** Rótulo para leitores de tela; vazio = decorativo (quando o nome já aparece ao lado). */
  label?: string
}

type Glyph = { width: number; height: number; path: string; dot: { cx: number; cy: number; r: number } }

/**
 * Logo vetorial: as letras usam a cor do texto (`text-*`) e o ponto é sempre o teal da marca.
 * Em fundo escuro, basta `className="text-white"`.
 */
function BrandSvg({ glyph, className, label }: LogoProps & { glyph: Glyph }) {
  const decorative = !label
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      className={cn("shrink-0 text-brand-graphite dark:text-white", className)}
    >
      <path fill="currentColor" d={glyph.path} />
      <circle cx={glyph.dot.cx} cy={glyph.dot.cy} r={glyph.dot.r} className="fill-brand-teal" />
    </svg>
  )
}

/** "maanu." completo: telas de entrada, páginas públicas e menu aberto. */
export function LogoWordmark({ className, label = siteConfig.name }: LogoProps) {
  return <BrandSvg glyph={WORDMARK} label={label} className={cn("h-7 w-auto", className)} />
}

/** "m.": favicon e menu recolhido. */
export function LogoMark({ className, label = siteConfig.name }: LogoProps) {
  return <BrandSvg glyph={MARK} label={label} className={cn("h-4 w-auto", className)} />
}
