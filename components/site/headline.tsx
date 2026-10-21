"use client"

import { Children, cloneElement, isValidElement, useRef, type ReactNode } from "react"

import { cn } from "@/lib/utils"

import { useInView } from "./use-in-view"

type HeadlineProps = {
  children: ReactNode
  className?: string
  id?: string
  as?: "h1" | "h2" | "h3" | "p"
  /** Termina com o ponto da marca (teal). */
  dot?: boolean | "mint"
  /** Atraso da entrada (ms). */
  delay?: number
  /** Dispara na hora (primeira dobra) em vez de esperar aparecer na tela. */
  immediate?: boolean
}

/**
 * Título em que cada palavra sobe por uma máscara (como no Escutaí) e que termina com o ponto da maanu, como o
 * sublinhado do Outlign. Textos soltos viram palavras; elementos (<span className="...">) mantêm o estilo e também
 * são cortados em palavras. Sem JavaScript o título aparece normal (o `noscript` do layout).
 */
export function Headline({ children, className, id, as: Tag = "h2", dot = true, delay = 0, immediate = false }: HeadlineProps) {
  const ref = useRef<HTMLElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.3 })
  const on = immediate || seen
  let index = 0

  const split = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === "string") {
        return child.split(/(\s+)/).map((part, i) => {
          if (!part.trim()) return part
          const w = index++
          return (
            <span key={`${w}-${i}`} className="mask-w" style={{ "--w": w } as React.CSSProperties}>
              <span>{part}</span>
            </span>
          )
        })
      }
      if (isValidElement<{ children?: ReactNode }>(child) && child.type !== "br" && child.props.children !== undefined) {
        return cloneElement(child, undefined, split(child.props.children))
      }
      return child
    })

  const content = split(children)
  return (
    <Tag
      ref={ref as never}
      id={id}
      data-on={on ? "true" : undefined}
      style={{ "--mask-delay": `${delay}ms` } as React.CSSProperties}
      className={cn("text-balance", className)}
    >
      {content}
      {dot ? <span aria-hidden className={cn("dot-end", dot === "mint" && "dot-end-mint")} /> : null}
    </Tag>
  )
}