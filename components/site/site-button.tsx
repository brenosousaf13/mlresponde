import { ArrowDown, ArrowRight } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const VARIANTS = {
  /** Teal sobre fundo escuro. */
  teal: "bg-brand-teal text-brand-graphite shadow-[0_0_44px_-12px] shadow-brand-teal/70 hover:bg-brand-mint",
  /** Grafite sobre fundo claro (seta em teal aceso). */
  graphite: "bg-brand-graphite text-white shadow-[0_18px_40px_-22px] shadow-brand-graphite/70 hover:bg-brand-graphite/90",
  /** Contorno sobre fundo escuro. */
  "outline-dark": "border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white",
  /** Contorno sobre fundo claro. */
  "outline-light": "border-brand-graphite/15 bg-white text-brand-graphite hover:bg-brand-offwhite",
} as const

/**
 * Espaço igual dos dois lados. A seta do lucide tem folga interna de 5/24 do tamanho em cada lado; a margem negativa
 * do ícone tira essa folga, para o desenho da seta ficar à mesma distância da borda que o começo do texto.
 */
const SIZES = {
  sm: { button: "h-10 gap-1.5 px-4 text-sm", icon: "size-4 -me-[3px]" },
  md: { button: "h-12 gap-2 px-6 text-base", icon: "size-4 -me-[3px]" },
  lg: { button: "h-14 gap-2 px-8 text-lg", icon: "size-5 -me-1" },
} as const

const ICONS = { right: ArrowRight, down: ArrowDown } as const

export type SiteButtonProps = Omit<ComponentProps<"a">, "children"> & {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  icon?: keyof typeof ICONS | null
  /** Ocupa a largura toda (o conteúdo fica centralizado). */
  block?: boolean
  children: ReactNode
}

/** Botão-link da página de vendas: mesmas medidas em todos os lugares. */
export function SiteButton({
  variant = "graphite",
  size = "md",
  icon = "right",
  block = false,
  className,
  children,
  ...props
}: SiteButtonProps) {
  const Icon = icon ? ICONS[icon] : null
  return (
    <a
      {...props}
      className={cn(
        buttonVariants(),
        "group/site-button rounded-full font-semibold",
        SIZES[size].button,
        VARIANTS[variant],
        block ? "w-full" : "w-fit",
        className
      )}
    >
      <span>{children}</span>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            SIZES[size].icon,
            "transition-transform duration-200",
            icon === "right" ? "group-hover/site-button:translate-x-0.5" : "group-hover/site-button:translate-y-0.5",
            variant === "graphite" && "text-brand-mint"
          )}
        />
      ) : null}
    </a>
  )
}
