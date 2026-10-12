import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatInteger, formatShare } from "@/lib/admin/format"
import { FUNNEL_STEPS, type FunnelKey } from "@/lib/admin/labels"

/** Funil de ativação dos cadastros recentes: quantos chegaram a cada etapa. */
export function FunnelCard({ funnel }: { funnel: Record<FunnelKey, number> }) {
  const top = funnel.signed_up || 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil de ativação</CardTitle>
        <CardDescription>Clientes que se cadastraram nos últimos 30 dias e até onde chegaram.</CardDescription>
      </CardHeader>
      <CardContent>
        {top === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cadastro nos últimos 30 dias.</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {FUNNEL_STEPS.map((step, index) => {
              const value = funnel[step.key] ?? 0
              const previous = index === 0 ? value : (funnel[FUNNEL_STEPS[index - 1].key] ?? 0)
              const width = top ? Math.max(2, (value / top) * 100) : 0
              const drop = index > 0 && previous > 0 ? previous - value : 0
              return (
                <li key={step.key} className="grid grid-cols-[9.5rem_1fr_4.5rem] items-center gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{step.label}</span>
                  <span className="relative h-6 overflow-hidden rounded-md bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-md bg-primary/80"
                      style={{ width: `${width}%`, opacity: 1 - index * 0.07 }}
                    />
                    <span className="relative flex h-full items-center px-2 text-xs font-medium tabular-nums">
                      {formatInteger(value)}
                    </span>
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground" title={drop ? `${drop} pararam aqui` : undefined}>
                    {formatShare(value, top)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
