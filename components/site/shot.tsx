"use client"

import Image from "next/image"

import { cn } from "@/lib/utils"

/** Capturas reais do app (dados fictícios), geradas por docs/brand/scripts/capturas-home.mjs. */
export const SHOTS = {
  recuperadorVisao: { src: "/home/recuperador-visao.webp", width: 2000, height: 1250, alt: "Tela do Recuperador da maanu: valor para recuperar agora, o que ficou para trás e o recuperado, com a lista de devoluções para revisar" },
  recuperadorDevolucoes: { src: "/home/recuperador-devolucoes.webp", width: 2000, height: 1250, alt: "Lista de devoluções do Recuperador com os prazos para revisar e contestar" },
  recuperadorRaioX: { src: "/home/recuperador-raio-x.webp", width: 2000, height: 1361, alt: "Raio-X do Recuperador: devoluções que dá para contestar, com o valor e a força do argumento" },
  perguntas: { src: "/home/perguntas.webp", width: 2000, height: 1250, alt: "Caixa de entrada de perguntas da maanu com a resposta da IA ao comprador" },
  reputacao: { src: "/home/reputacao.webp", width: 2000, height: 1250, alt: "Escudo de Reputação da maanu: termômetro do Mercado Livre e folga de cada métrica" },
  resultados: { src: "/home/resultados.webp", width: 2000, height: 1361, alt: "Tela de Resultados da maanu: economia estimada e perguntas por dia" },
  mobileRecuperador: { src: "/home/mobile-recuperador.webp", width: 780, height: 1688, alt: "Recuperador no celular" },
  mobileDevolucoes: { src: "/home/mobile-devolucoes.webp", width: 780, height: 1688, alt: "Lista de devoluções no celular" },
  mobilePerguntas: { src: "/home/mobile-perguntas.webp", width: 780, height: 1688, alt: "Perguntas no celular" },
} as const

export type ShotKey = keyof typeof SHOTS

/** Telas largas têm uma versão de 1000 px para o celular baixar menos (o resto fica a cargo do navegador). */
function shotLoader({ src, width }: { src: string; width: number }) {
  const file = width <= 1100 && !src.includes("mobile-") ? src.replace(".webp", "-1000.webp") : src
  return `${file}?w=${width}`
}

export function Shot({
  name,
  className,
  sizes = "(min-width: 1024px) 1100px, 100vw",
  priority = false,
}: {
  name: ShotKey
  className?: string
  sizes?: string
  priority?: boolean
}) {
  const shot = SHOTS[name]
  return (
    <Image
      src={shot.src}
      alt={shot.alt}
      width={shot.width}
      height={shot.height}
      sizes={sizes}
      priority={priority}
      loader={shotLoader}
      className={cn("block h-auto w-full select-none", className)}
      draggable={false}
    />
  )
}