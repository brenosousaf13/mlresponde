import { Badge } from "@/components/ui/badge"
import type { AccessState } from "@/lib/access/access"

const LABELS: Record<AccessState, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  trial: { label: "Teste grátis", variant: "secondary" },
  active: { label: "Ativa", variant: "default" },
  blocked: { label: "Bloqueada", variant: "destructive" },
}

export function AccessBadge({ state }: { state: AccessState }) {
  const { label, variant } = LABELS[state]
  return <Badge variant={variant}>{label}</Badge>
}
