import { BanIcon, BookOpenTextIcon, FlaskConicalIcon, GraduationCapIcon, PartyPopperIcon, PaletteIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { AssistantStatus } from "@/components/assistente/assistant-status"
import { BlacklistManager } from "@/components/assistente/blacklist-manager"
import { ExamplesManager } from "@/components/assistente/examples-manager"
import { HowItWorks } from "@/components/assistente/how-it-works"
import { KnowledgeView } from "@/components/assistente/knowledge-view"
import { SetupWizard } from "@/components/assistente/setup-wizard"
import { StyleForm } from "@/components/assistente/style-form"
import { TestPanel } from "@/components/assistente/test-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { parseStoreProfile } from "@/lib/assistant/profile"
import { CONFIDENCE_PRESETS } from "@/lib/answers/decision"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Assistente de IA" }

const TABS = ["conhecimento", "estilo", "ensinadas", "bloqueados", "testar"] as const

function presetFor(threshold: number) {
  return (
    [...CONFIDENCE_PRESETS].sort(
      (a, b) => Math.abs(Number(a.value) - threshold) - Math.abs(Number(b.value) - threshold)
    )[0]?.value ?? "0.75"
  )
}

export default async function AssistantPage({ searchParams }: PageProps<"/assistente">) {
  const context = await requireSection("assistente")
  const params = await searchParams
  const canManage = canManageOrganization(context.role)

  const supabase = await createClient()
  const { data: accounts, error } = await supabase
    .from("ml_accounts")
    .select(
      "id, nickname, ml_user_id, status, auto_reply_enabled, ai_confidence_threshold, answer_tone, answer_greeting, answer_signature, store_briefing, store_profile, store_setup_step, store_profile_completed_at, updated_at"
    )
    .eq("organization_id", context.organization.id)
    .neq("status", "disconnected")
    .order("created_at")
  if (error) throw error

  const selected =
    accounts.find((account) => account.id === params.conta) ??
    accounts.find((account) => account.status === "active") ??
    accounts[0]

  const description = "Ensine a IA sobre a sua loja e defina como ela responde os compradores."
  if (!selected) {
    return <PageHeader title="Assistente de IA" description="Conecte uma conta do Mercado Livre para configurar a IA." />
  }

  const nickname = (account: (typeof accounts)[number]) => account.nickname || `Conta ${account.ml_user_id}`
  const profile = parseStoreProfile(selected.store_profile)
  const setupDone = Boolean(selected.store_profile_completed_at)
  const showWizard = !setupDone || params.configurar === "1"
  const style = {
    tone: selected.answer_tone,
    greeting: selected.answer_greeting,
    signature: selected.answer_signature,
    threshold: presetFor(Number(selected.ai_confidence_threshold)),
  }

  const header = (
    <PageHeader
      title="Assistente de IA"
      description={description}
      actions={
        <>
          {accounts.length > 1 ? (
            <AccountSelect
              accounts={accounts.map((account) => ({ id: account.id, nickname: nickname(account) }))}
              value={selected.id}
              resetParams={["configurar", "concluido"]}
            />
          ) : null}
          <AssistantStatus
            key={`${selected.id}-${selected.auto_reply_enabled}`}
            accountId={selected.id}
            enabled={selected.auto_reply_enabled}
            disabled={!canManage || selected.status !== "active" || !setupDone}
            disabledReason={
              !setupDone
                ? "Conclua a configuração para ligar a IA."
                : selected.status !== "active"
                  ? "Conta desativada. Ative em Contas do Mercado Livre."
                  : !canManage
                    ? "Só o dono ou um administrador pode alterar."
                    : undefined
            }
          />
        </>
      }
    />
  )

  if (showWizard) {
    return (
      <>
        {header}
        {canManage ? (
          <SetupWizard
            key={`${selected.id}-${selected.updated_at}`}
            accountId={selected.id}
            initialProfile={profile}
            initialStyle={style}
            initialStep={params.configurar === "1" ? 0 : selected.store_setup_step}
            defaultStoreName={context.organization.name}
            copySources={accounts
              .filter((account) => account.id !== selected.id && account.store_profile_completed_at)
              .map((account) => ({ id: account.id, name: nickname(account) }))}
            isRedo={setupDone}
          />
        ) : (
          <Alert>
            <AlertTitle>O assistente ainda não foi configurado</AlertTitle>
            <AlertDescription>Peça ao dono ou a um administrador da loja para concluir a configuração.</AlertDescription>
          </Alert>
        )}
      </>
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
      .select("id, item_id, item_title, question_text, answer_text, ml_questions(item_title)")
      .eq("ml_account_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ])

  const tab = TABS.find((key) => key === params.aba) ?? "conhecimento"

  return (
    <>
      {header}

      {params.concluido === "1" ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <PartyPopperIcon />
          <AlertTitle>Pronto! O assistente já conhece a sua loja.</AlertTitle>
          <AlertDescription className="text-emerald-900/80 dark:text-emerald-100/80">
            Faça algumas perguntas na aba Testar para ver como ele responde. Quando estiver do seu jeito, ligue a IA no
            botão &ldquo;IA pausada&rdquo; acima.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue={params.concluido === "1" ? "testar" : tab} className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          {[
            { value: "conhecimento", label: "Sobre a loja", icon: BookOpenTextIcon },
            { value: "estilo", label: "Jeito de responder", icon: PaletteIcon },
            { value: "ensinadas", label: "Respostas ensinadas", icon: GraduationCapIcon, count: examples?.length },
            { value: "bloqueados", label: "Anúncios bloqueados", icon: BanIcon, count: blacklist?.length },
            { value: "testar", label: "Testar", icon: FlaskConicalIcon },
          ].map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="h-9 flex-none rounded-lg border-transparent px-3 text-muted-foreground hover:bg-card data-active:border-border data-active:bg-card data-active:text-foreground data-active:shadow-xs"
            >
              <item.icon />
              {item.label}
              {item.count ? (
                <Badge variant="secondary" className="ml-0.5">
                  {item.count}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="conhecimento">
          <KnowledgeView accountId={selected.id} profile={profile} extraInfo={selected.store_briefing} canManage={canManage} />
        </TabsContent>
        <TabsContent value="estilo">
          <StyleForm accountId={selected.id} initial={style} disabled={!canManage} />
        </TabsContent>
        <TabsContent value="ensinadas" className="flex flex-col gap-6">
          <HowItWorks
            title="Como funcionam as respostas ensinadas"
            steps={[
              "Ao responder uma pergunta em Perguntas com “Ensinar a IA” marcado, a sua resposta é guardada aqui.",
              "Quando chega uma pergunta parecida, a IA usa a resposta ensinada como referência — ela tem prioridade sobre o resto.",
              "As que vieram de um anúncio valem só para ele. As criadas aqui podem valer para todos os anúncios.",
            ]}
          />
          <ExamplesManager
            accountId={selected.id}
            canManage={canManage}
            examples={(examples ?? []).map((example) => ({
              id: example.id,
              item_id: example.item_id,
              item_title: example.item_title ?? example.ml_questions?.item_title ?? null,
              question_text: example.question_text,
              answer_text: example.answer_text,
            }))}
          />
        </TabsContent>
        <TabsContent value="bloqueados" className="flex flex-col gap-6">
          <HowItWorks
            title="Como funcionam os anúncios bloqueados"
            steps={[
              "Bloqueie anúncios em que a IA não deve responder: orçamentos, produtos sob encomenda, itens delicados.",
              "Perguntas desses anúncios nunca são respondidas pela IA (e não gastam IA): chegam direto para você em Perguntas.",
              "Desbloqueie quando quiser: as próximas perguntas voltam a passar pela IA.",
            ]}
          />
          <BlacklistManager accountId={selected.id} items={blacklist ?? []} canManage={canManage} />
        </TabsContent>
        <TabsContent value="testar">
          <TestPanel accountId={selected.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}
