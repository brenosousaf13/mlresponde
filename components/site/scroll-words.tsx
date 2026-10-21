"use client"

import { Children, cloneElement, isValidElement, useRef, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

import { clamp01, useScrollFrame } from "./use-scroll-frame"

function countWords(node: ReactNode): number {
  let total = 0
  Children.forEach(node, (child) => {
    if (typeof child === "string") total += child.split(/\s+/).filter(Boolean).length
    else if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined) total += countWords(child.props.children)
  })
  return total
}

/**
 * Texto grande que "acende" palavra por palavra conforme a página rola (como o "Creative projects shouldn't feel like
 * chaos" do Outlign). Uma variável CSS (--p) só é atualizada; cada palavra calcula a sua opacidade com CSS puro.
 * Os elementos (<span className="...">) mantêm o estilo, então dá para destacar trechos em teal.
 */
export function ScrollWords({
  children,
  className,
  as: Tag = "h2",
  id,
  /** Onde a leitura começa e termina, em fração da altura da tela medida a partir do topo do bloco. */
  range = [0.88, 0.38],
}: {
  children: ReactNode
  className?: string
  as?: "h2" | "p" | "div"
  id?: string
  range?: [number, number]
}) {
  const ref = useRef<HTMLElement>(null)
  const total = countWords(children)
  let index = 0

  useScrollFrame(ref, (element, vh) => {
    const top = element.getBoundingClientRect().top
    const p = clamp01((vh * range[0] - top) / (vh * (range[0] - range[1])))
    element.style.setProperty("--p", p.toFixed(3))
  })

  const split = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === "string") {
        return child.split(/(\s+)/).map((part, i) => {
          if (!part.trim()) return part
          const w = index++
          return (
            <span key={`${w}-${i}`} className="scroll-word" style={{ "--i": w } as CSSProperties}>
              {part}
            </span>
          )
        })
      }
      if (isValidElement<{ children?: ReactNode }>(child) && child.type !== "br" && child.props.children !== undefined) {
        return cloneElement(child, undefined, split(child.props.children))
      }
      return child
    })

  return (
    <Tag ref={ref as never} id={id} style={{ "--n": total, "--p": 0 } as CSSProperties} className={cn("text-balance", className)}>
      {split(children)}
    </Tag>
  )
}