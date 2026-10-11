import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/app/page-header"
import { AnswerSettingsForm } from "@/components/respostas/answer-settings-form"
import { AutoReplySwitch } from "@/components/respostas/auto-reply-switch"
import { BlacklistManager } from "@/components/respostas/blacklist-manager"
import { ExamplesManager } from "@/components/respostas/examples-manager"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CONFIDENCE_PRESETS } from "@/lib/answers/decision"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Respostas da IA" }

function presetFor(threshold: number) {
  return (
    [...CONFIDENCE_PRESETS].sort(
      (a, b) => Math.abs(Number(a.value) - threshold) - Math.abs(Number(b.value) - threshold)
    )[0]?.value ?? "0.75"
  )
}

export default async function AnswersSettingsPage({ searchParams }: PageProps<"/respostas">) {
  const context = await requireSection("respostas")
  const params = await searchParams
  const canManage = canManageOrganization(context.role)

  const supabase = await createClient()
  const { data: accounts, error } = await supabase
    .from("ml_accounts")
    .select(
      "id, nickname, ml_user_id, status, auto_reply_enabled, ai_confidence_threshold, answer_tone, answer_greeting, answer_signature, store_briefing"
    )
    .eq("organization_id", context.organization.id)
    .neq("status", "disconnected")
    .order("created_at")
  if (error) throw error

  const selected =
    accounts.find((account) => account.id === params.conta) ??
    accounts.find((account) => account.status === "active") ??
    accounts[0]

  if (!selected) {
    return (
      <PageHeader title="Respostas da IA" description="Conecte uma conta do Mercado Livre para configurar a IA." />
    )
  }

  const [{ data: blacklist }, { data: examples }] = await Promise.all([
    supabase
      .from("item_blacklist")
      .select("id, item_id, item_title")
      .eq("ml_account_id", selected.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_examples")
      .select("id, item_id, question_text, answer_text, ml_questions(item_title)")
      .eq("ml_account_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const nickname = (account: (typeof accounts)[number]) => account.nickname || `Conta ${account.ml_user_id}`

  return (
    <>
      <PageHeader
        title="Respostas da IA"
        description="Defina quando e como a IA responde os compradores de cada conta."
      />

      {accounts.length > 1 ? (
        <nav className="flex flex-wrap gap-1" aria-label="Escolher conta">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/respostas?conta=${account.id}`}
              aria-current={account.id === selected.id ? "page" : undefined}
              className={cn(buttonVariants({ variant: account.id === selected.id ? "secondary" : "ghost", size: "sm" }))}
            >
              {nickname(account)}
              {account.auto_reply_enabled ? <Badge className="ml-1">IA ligada</Badge> : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Só o dono ou um administrador da loja pode alterar estas configurações.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{nickname(selected)}</CardTitle>
          <CardDescription>
            {selected.status === "active"
              ? "Ligue quando as configurações abaixo estiverem do seu jeito."
              : "Esta conta está desativada. Ative em Contas do Mercado Livre."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AutoReplySwitch
            key={`${selected.id}-${selected.auto_reply_enabled}`}
            accountId={selected.id}
            enabled={selected.auto_reply_enabled}
            disabled={!canManage || selected.status !== "active"}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Como a IA responde</CardTitle>
            <CardDescription>
              A IA usa o anúncio (título, descrição, ficha técnica, variações e estoque), as informações da loja e as
              respostas ensinadas. Se não tiver certeza, deixa a pergunta para você.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnswerSettingsForm
              key={selected.id}
              settings={{
                accountId: selected.id,
                threshold: presetFor(Number(selected.ai_confidence_threshold)),
                tone: selected.answer_tone,
                greeting: selected.answer_greeting,
                signature: selected.answer_signature,
                briefing: selected.store_briefing,
              }}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Respostas ensinadas</CardTitle>
              <CardDescription>Têm prioridade sobre todo o resto quando a pergunta é parecida.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExamplesManager
                key={selected.id}
                accountId={selected.id}
                examples={(examples ?? []).map((example) => ({
                  id: example.id,
                  item_id: example.item_id,
                  item_title: example.ml_questions?.item_title ?? null,
                  question_text: example.question_text,
                  answer_text: example.answer_text,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Anúncios que a IA não responde</CardTitle>
              <CardDescription>
                Perguntas destes anúncios sempre ficam para você (ex.: orçamentos, produtos sob encomenda).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BlacklistManager key={selected.id} accountId={selected.id} items={blacklist ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
