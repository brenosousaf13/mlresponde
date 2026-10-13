import { CircleAlertIcon, CircleCheckIcon, StoreIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { ConnectMlDialog } from "@/components/contas/connect-ml-dialog"
import { MlAccountActions } from "@/components/contas/ml-account-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Contas do Mercado Livre" }

const NOTICES: Record<string, { ok: boolean; title: string; message: string }> = {
  conectada: {
    ok: true,
    title: "Conta conectada!",
    message:
      "Já estamos trazendo as perguntas sem resposta. As respostas automáticas começam pausadas: configure e ligue no Assistente de IA.",
  },
  reconectada: { ok: true, title: "Conta reconectada!", message: "A conexão com o Mercado Livre foi renovada." },
  inativa: {
    ok: false,
    title: "Conta conectada, mas desativada",
    message: "Seu plano já está no limite de contas ativas. Desative outra conta para ativar esta ou suba de plano em Assinatura.",
  },
  conflito: {
    ok: false,
    title: "Essa conta já está em outro cadastro",
    message:
      "Cada conta do Mercado Livre só pode estar em um cadastro. Se ela é sua, fale com o suporte para transferi-la.",
  },
  cancelado: { ok: false, title: "Conexão cancelada", message: "Você não autorizou o acesso no Mercado Livre." },
  expirado: { ok: false, title: "O tempo para conectar acabou", message: "Comece a conexão de novo." },
  invalido: { ok: false, title: "Não foi possível validar a conexão", message: "Por segurança, comece a conexão de novo." },
  erro: { ok: false, title: "Algo deu errado", message: "Não conseguimos falar com o Mercado Livre. Tente novamente em instantes." },
  "sem-permissao": { ok: false, title: "Sem permissão", message: "Só o dono ou um administrador pode conectar contas." },
}

const STATUS_BADGES: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  active: { label: "Ativa", variant: "default" },
  inactive: { label: "Desativada", variant: "secondary" },
  disconnected: { label: "Desconectada", variant: "outline" },
}

export default async function MlAccountsPage({ searchParams }: PageProps<"/contas">) {
  const context = await requireSection("contas")
  const params = await searchParams
  const notice = typeof params.ml === "string" ? NOTICES[params.ml] : undefined
  const canManage = canManageOrganization(context.role)

  const supabase = await createClient()
  const { data: accounts, error } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, status, token_status, created_at")
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: true })
  if (error) throw error

  const limit = context.organization.mlAccountsLimit

  return (
    <>
      <PageHeader
        title="Contas do Mercado Livre"
        description={`${context.mlAccounts.active} de ${limit} conta${limit === 1 ? "" : "s"} ativa${limit === 1 ? "" : "s"} no ${context.plan.id === "trial" ? "teste grátis" : `plano ${context.plan.name}`}.`}
        actions={canManage && accounts.length > 0 ? <ConnectMlDialog /> : undefined}
      />

      {notice ? (
        <Alert variant={notice.ok ? "default" : "destructive"}>
          {notice.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {accounts.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StoreIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma conta conectada</EmptyTitle>
            <EmptyDescription>
              Conecte sua conta de vendedor do Mercado Livre para liberar a plataforma.
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <ConnectMlDialog label="Conectar primeira conta" />
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ItemGroup className="gap-3">
          {accounts.map((account) => {
            const nickname = account.nickname || `Conta ${account.ml_user_id}`
            const badge = STATUS_BADGES[account.status] ?? STATUS_BADGES.inactive
            return (
              <Item key={account.id} variant="outline">
                <ItemMedia>
                  <Avatar className="size-10">
                    <AvatarFallback>{nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {nickname}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {account.token_status === "invalid" && account.status !== "disconnected" ? (
                      <Badge variant="destructive">Reconexão necessária</Badge>
                    ) : null}
                  </ItemTitle>
                  <ItemDescription>
                    ID {account.ml_user_id} · conectada em {formatDate(account.created_at, "short")}
                  </ItemDescription>
                </ItemContent>
                {canManage ? (
                  <ItemActions>
                    <MlAccountActions
                      accountId={account.id}
                      nickname={nickname}
                      status={account.status}
                      tokenStatus={account.token_status}
                    />
                  </ItemActions>
                ) : null}
              </Item>
            )
          })}
        </ItemGroup>
      )}
    </>
  )
}
