import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  KeyRoundIcon,
  LifeBuoyIcon,
  ServerIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AiKeyActions } from "@/components/admin/ai-key-actions"
import { AiKeyAddDialog } from "@/components/admin/ai-key-add-dialog"
import { ToneBadge } from "@/components/admin/badges"
import { PageHeader } from "@/components/app/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatInteger, formatUsd } from "@/lib/admin/format"
import { AI_KEY_STATUS, auditActionLabel } from "@/lib/admin/labels"
import type { AdminAiKey } from "@/lib/admin/types"
import { effectiveKeySource, type EffectiveKey } from "@/lib/ai/keys"
import { getAdminAiKeys } from "@/lib/dal/admin"
import { formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Chaves de IA" }

type Step = {
  key: EffectiveKey | "standby"
  icon: typeof KeyRoundIcon
  title: string
  detail: string
  available: boolean
}

/** Ordem em que a IA procura uma chave: em uso no painel → reservas (se a OpenAI recusar) → variável da Vercel. */
function UsageChain({ steps, effective }: { steps: Step[]; effective: EffectiveKey }) {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {steps.map((step, index) => {
        const current = step.key === effective
        return (
          <li
            key={step.key}
            className={cn(
              "relative flex gap-3 rounded-xl border bg-card px-4 py-3",
              current && "border-primary/40 bg-primary/5 ring-1 ring-primary/30",
              !step.available && !current && "border-dashed bg-muted/40"
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <step.icon className={cn("size-3.5", current ? "text-brand-teal-ink" : "text-muted-foreground")} />
                {step.title}
                {current ? <ToneBadge tone="teal">Em uso agora</ToneBadge> : null}
              </span>
              <span className={cn("text-xs text-muted-foreground", !step.available && "italic")}>{step.detail}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CheckCell({ row }: { row: AdminAiKey }) {
  if (!row.last_checked_at) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium",
          row.last_check_ok ? "text-brand-teal-ink" : "text-destructive"
        )}
      >
        {row.last_check_ok ? <CircleCheckIcon className="size-3.5" /> : <CircleXIcon className="size-3.5" />}
        {row.last_check_ok ? "Funcionando" : "Com erro"}
      </span>
      <time className="text-xs text-muted-foreground" title={formatDateTime(row.last_checked_at)}>
        {timeAgo(row.last_checked_at)}
      </time>
      {!row.last_check_ok && row.last_check_error ? (
        <span className="line-clamp-2 max-w-56 text-xs whitespace-normal text-destructive/80" title={row.last_check_error}>
          {row.last_check_error}
        </span>
      ) : null}
    </div>
  )
}

export default async function AdminAiKeysPage() {
  const data = await getAdminAiKeys()
  const { setup } = data
  const active = data.keys.find((row) => row.status === "active") ?? null
  const standby = data.keys.filter((row) => row.status === "standby")
  const encryptionReady = setup.encryption === "ok"
  const effective = effectiveKeySource({
    hasActivePanelKey: Boolean(active),
    encryptionReady,
    envConfigured: setup.envConfigured,
  })

  const steps: Step[] = [
    {
      key: "panel",
      icon: KeyRoundIcon,
      title: "Chave em uso do painel",
      detail: active
        ? `${active.label} (${active.hint})${encryptionReady ? "" : " — não abre sem a chave-mestra"}`
        : "Nenhuma chave em uso cadastrada aqui.",
      available: Boolean(active) && encryptionReady,
    },
    {
      key: "standby",
      icon: LifeBuoyIcon,
      title: standby.length === 0 ? "Nenhuma reserva" : standby.length === 1 ? "1 reserva" : `${standby.length} reservas`,
      detail: standby.length
        ? `Entra sozinha se a OpenAI recusar a chave em uso (próxima: ${standby[0].label}).`
        : "Sem reserva: cadastre uma segunda chave para trocar sozinho em caso de recusa.",
      available: standby.length > 0,
    },
    {
      key: "env",
      icon: ServerIcon,
      title: "Variável OPENAI_API_KEY",
      detail: setup.envConfigured
        ? "Último recurso, configurada na Vercel. Trocar exige novo deploy."
        : "Não configurada neste servidor.",
      available: setup.envConfigured,
    },
  ]

  return (
    <>
      <PageHeader
        title="Chaves de IA"
        description="As chaves da OpenAI que a maanu usa para responder. Ficam criptografadas: depois de salvas, ninguém vê o valor de novo."
        actions={<AiKeyAddDialog hasActive={Boolean(active)} disabled={!encryptionReady} model={setup.model} />}
      />

      {!encryptionReady ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>
            {setup.encryption === "missing" ? "Falta a chave-mestra no servidor" : "A chave-mestra do servidor é inválida"}
          </AlertTitle>
          <AlertDescription>
            A variável AI_KEYS_ENCRYPTION_KEY (32 bytes em base64) tranca as chaves cadastradas aqui. Sem ela não dá para
            cadastrar chaves e as já cadastradas não são usadas: a IA fica com a OPENAI_API_KEY.
          </AlertDescription>
        </Alert>
      ) : null}

      {effective === "none" ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Nenhuma chave da OpenAI disponível: a IA não consegue responder</AlertTitle>
          <AlertDescription>
            As perguntas ficam na fila tentando de novo. Cadastre uma chave aqui ou configure a OPENAI_API_KEY na Vercel.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Qual chave a IA usa</CardTitle>
          <CardDescription>
            Nesta ordem. Trocar aqui vale na hora (em até 1 minuto em todos os servidores), sem novo deploy. Modelo atual:{" "}
            <span className="font-mono">{setup.model}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageChain steps={steps} effective={effective} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chaves cadastradas</CardTitle>
          <CardDescription>Uso e custo dos últimos 30 dias. Testar uma chave custa uma fração de centavo.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Nome</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último teste</TableHead>
                <TableHead className="text-right">Chamadas (30 d)</TableHead>
                <TableHead className="text-right">Custo (30 d)</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="w-12 pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.keys.map((row) => {
                const status = AI_KEY_STATUS[row.status]
                return (
                  <TableRow key={row.id} className={cn(row.status === "disabled" && "text-muted-foreground")}>
                    <TableCell className="pl-6">
                      <span className="block max-w-56 truncate font-medium text-foreground" title={row.label}>
                        {row.label}
                      </span>
                      <span
                        className="block text-xs text-muted-foreground"
                        title={row.created_by_email ? `Cadastrada por ${row.created_by_email}` : undefined}
                      >
                        Cadastrada em {formatDateTime(row.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.hint}</TableCell>
                    <TableCell>
                      <ToneBadge tone={status.tone}>
                        <span title={status.hint}>{status.label}</span>
                      </ToneBadge>
                      {row.status === "disabled" && row.disabled_reason ? (
                        <span
                          className="mt-1 line-clamp-2 max-w-56 text-xs whitespace-normal text-muted-foreground"
                          title={row.disabled_reason}
                        >
                          {row.disabled_reason}
                          {row.disabled_at ? ` · ${timeAgo(row.disabled_at)}` : ""}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <CheckCell row={row} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInteger(row.calls_30d)}
                      {row.failed_30d > 0 ? (
                        <span className="block text-xs text-destructive">{formatInteger(row.failed_30d)} com erro</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(row.cost_30d_usd)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.last_used_at ? (
                        <time title={formatDateTime(row.last_used_at)}>{timeAgo(row.last_used_at)}</time>
                      ) : (
                        "Nunca"
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <AiKeyActions
                        keyInfo={{ id: row.id, label: row.label, hint: row.hint, status: row.status }}
                        nextStandby={standby.find((item) => item.id !== row.id)?.label ?? null}
                        envConfigured={setup.envConfigured}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell className="pl-6">
                  <span className="font-medium">Variável OPENAI_API_KEY</span>
                  <span className="block text-xs text-muted-foreground">Na Vercel · trocar exige novo deploy</span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
                <TableCell>
                  <ToneBadge tone={setup.envConfigured ? "graphite" : "slate"}>
                    {setup.envConfigured ? "Último recurso" : "Não configurada"}
                  </ToneBadge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInteger(data.env.calls_30d)}
                  {data.env.failed_30d > 0 ? (
                    <span className="block text-xs text-destructive">{formatInteger(data.env.failed_30d)} com erro</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatUsd(data.env.cost_30d_usd)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {data.env.last_used_at ? (
                    <time title={formatDateTime(data.env.last_used_at)}>{timeAgo(data.env.last_used_at)}</time>
                  ) : (
                    "Nunca"
                  )}
                </TableCell>
                <TableCell className="pr-6" />
              </TableRow>
            </TableBody>
          </Table>
          {data.keys.length === 0 ? (
            <p className="px-6 pt-4 text-sm text-muted-foreground">
              Nenhuma chave cadastrada ainda. Enquanto isso, a IA usa a variável OPENAI_API_KEY da Vercel.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trocar a chave sem parar a IA</CardTitle>
            <CardDescription>O jeito seguro de girar a chave (por exemplo, a cada 90 dias).</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground marker:font-medium marker:text-foreground">
              <li>No painel da OpenAI, crie a chave nova no projeto da maanu, com data de validade.</li>
              <li>
                Aqui, <span className="font-medium text-foreground">Cadastrar chave</span> com “Usar esta chave agora”
                marcado. A maanu testa antes; a antiga vira reserva.
              </li>
              <li>Espere a coluna “Último uso” da chave nova mostrar uso (até 1 minuto).</li>
              <li>Revogue a antiga na OpenAI e, aqui, Desativar → Remover.</li>
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-brand-teal-ink" />
              Boas práticas na OpenAI
            </CardTitle>
            <CardDescription>Reduzem o estrago se uma chave vazar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
              <li>Chave de projeto com permissão só para gerar respostas; nunca a de administração.</li>
              <li>Data de validade na chave e limite de gasto mensal no projeto.</li>
              <li>
                Mais chaves no mesmo projeto <span className="font-medium text-foreground">não</span> aumentam o limite de
                uso: ele vale para o projeto e a organização inteiros. Reserva serve para trocar sem parar.
              </li>
              <li>
                Se a OpenAI recusar a chave em uso, a reserva entra sozinha (no máximo 1 troca a cada 10 minutos) e fica no
                histórico.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas mudanças nas chaves</CardTitle>
          <CardDescription>Cadastros, trocas, testes e trocas automáticas.</CardDescription>
          <CardAction>
            <Link href="/admin/auditoria?tipo=ai_key." className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver na Auditoria
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.recent_events.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nada registrado ainda.</p>
          ) : (
            <ol className="flex flex-col">
              {data.recent_events.map((event, index) => (
                <li key={`${event.created_at}-${index}`} className="flex gap-3 border-b py-2.5 last:border-b-0">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      event.action === "ai_key.auto_disabled" ? "bg-destructive" : "bg-primary"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium">{auditActionLabel(event.action)}</span>
                      <time className="text-xs text-muted-foreground tabular-nums">{formatDateTime(event.created_at)}</time>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.summary}</p>
                    <p className="text-xs text-muted-foreground/80">por {event.actor_email ?? "sistema"}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  )
}
