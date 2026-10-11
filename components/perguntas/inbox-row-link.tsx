"use client"

import Link from "next/link"

/** Link de uma linha da lista: no desktop mantém a rolagem (a conversa abre ao lado); no celular sobe ao topo. */
export function InboxRowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={() => {
        if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 })
      }}
    >
      {children}
    </Link>
  )
}
