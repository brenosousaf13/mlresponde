import { MinusIcon, TrendingDownIcon, TrendingUpIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatChange } from "@/lib/admin/format"
import { cn } from "@/lib/utils"

/** Número de destaque no estilo dos "section cards" do shadcn. */
export function StatCard({
  label,
  icon: Icon,
  value,
  change,
  invertChange = false,
  headline,
  detail,
  className,
}: {
  label: string
  icon: LucideIcon
  value: React.ReactNode
  /** Variação % contra o período anterior (null = sem base). */
  change?: number | null
  /** Para custos: subir é ruim (vermelho), cair é bom. */
  invertChange?: boolean
  headline?: React.ReactNode
  detail?: React.ReactNode
  className?: string
}) {
  const TrendIcon = change && change > 0 ? TrendingUpIcon : change && change < 0 ? TrendingDownIcon : MinusIcon
  const good = change === null || change === undefined || change === 0 ? null : invertChange ? change < 0 : change > 0
  return (
    <Card className={cn("bg-linear-to-t from-primary/[0.04] to-card", className)}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" />
          {label}
        </CardDescription>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CardTitle className="text-3xl font-semibold whitespace-nowrap tabular-nums">{value}</CardTitle>
          {change !== undefined && change !== null ? (
            <Badge
              variant="outline"
              className={cn(good === true && "border-primary/30 text-brand-teal-ink", good === false && "border-destructive/30 text-destructive")}
            >
              <TrendIcon data-icon="inline-start" />
              {formatChange(change)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      {headline || detail ? (
        <CardFooter className="mt-auto flex-col items-start gap-1 border-t-0 bg-transparent pt-0 text-sm">
          {headline ? <p className="font-medium">{headline}</p> : null}
          {detail ? <p className="text-muted-foreground">{detail}</p> : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}
