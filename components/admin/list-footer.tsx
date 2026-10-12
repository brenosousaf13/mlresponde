import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { formatInteger } from "@/lib/admin/format"
import { cn } from "@/lib/utils"

/** Rodapé de lista paginada: "1–25 de 120" + anterior/próxima. */
export function ListFooter({
  page,
  pageSize,
  total,
  hrefFor,
  noun,
}: {
  page: number
  pageSize: number
  total: number
  hrefFor: (page: number) => string
  noun: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)
  const link = (target: number, disabled: boolean, children: React.ReactNode, label: string) =>
    disabled ? (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {children}
      </span>
    ) : (
      <Link href={hrefFor(target)} aria-label={label} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {children}
      </Link>
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? `Nenhum ${noun}` : `${formatInteger(first)}–${formatInteger(last)} de ${formatInteger(total)}`}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {link(page - 1, page <= 1, <><ChevronLeftIcon data-icon="inline-start" />Anterior</>, "Página anterior")}
          <span className="tabular-nums">
            {page} / {pages}
          </span>
          {link(page + 1, page >= pages, <>Próxima<ChevronRightIcon data-icon="inline-end" /></>, "Próxima página")}
        </div>
      ) : null}
    </div>
  )
}
