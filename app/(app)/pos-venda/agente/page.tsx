import { ArrowLeftIcon, FlaskConicalIcon, GraduationCapIcon, SlidersHorizontalIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { HowItWorks } from "@/components/assistente/how-it-works"
import { AfterSaleExamples } from "@/components/pos-venda/after-sale-examples"
import { AgentSettingsForm } from "@/components/pos-venda/agent-settings-form"
import { AgentStatus } from "@/components/pos-venda/agent-status"
import { AgentTestPanel } from "@/components/pos-venda/agent-test-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { afterSalePresetFor, parseSensitivePolicy } from "@/lib/after-sale/decision"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Agente de pós-venda" }

const TABS = ["configuracao", "ensinadas", "testar"] as const

export default async function AfterSaleAgentPage({ searchParams }: PageProps<"/pos-venda/agente">) {
  const context = await requireSection("pos_venda")
  const params = await searchParams
  const canManage = canManageOrganization(context.role)

  const supabase = await createClient()
  const { data: accounts, error } = await supabase
    .from("ml_accounts")
    .select(
      "id, nickname, ml_user_id, status, store_profile_completed_at, after_sale_enabled, after_sale_instructions, after_sale_confidence_threshold, after_sale_sensitive_policy, after_sale_signature"
    )
    .eq("organization_id", context.organization.id)
    .neq("status", "disconnected")
    .order("created_at")
  if (error) throw error

  const back = (
    <Link href="/pos-venda" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit text-muted-foreground")}>
      <ArrowLeftIcon data-icon="inline-start" />
      Pós-venda
    </Link>
  )
  const selected = accounts.find((account) => account.id === params.conta) ?? accounts.find((account) => account.status === "active") ?? accounts[0]
  if (!selected) {
    return (
      <>
        {back}
        <PageHeader title="Agente de pós-venda" description="Conecte uma conta do Mercado Livre para configurar o agente." />
      </>
    )
  }

  const nickname = (account: (typeof accounts)[number]) => account.nickname || `Conta ${account.ml_user_id}`
  const { data: examples, error: examplesError } = await supabase
    .from("after_sale_examples")
    .select("id, buyer_message, answer_text")
    .eq("ml_account_id", selected.id)
    .order("created_at", { ascending: false })
    .limit(300)
  if (examplesError) throw examplesError

  const tab = TABS.find((key) => key === params.aba) ?? "configuracao"

  return (
    <>
      {back}
      <PageHeader
        title="Agente de pós-venda"
        description="Defina como o agente conversa com quem já comprou. Ele lê o pedido, o envio e o histórico da conversa antes de responder."
        actions={
          <>
            {accounts.length > 1 ? (
              <AccountSelect accounts={accounts.map((account) => ({ id: account.id, nickname: nickname(account) }))} value={selected.id} />
            ) : null}
            <AgentStatus
              key={`${selected.id}-${selected.after_sale_enabled}`}
              accountId={selected.id}
              enabled={selected.after_sale_enabled}
              disabled={!canManage || (!selected.after_sale_enabled && selected.status !== "active")}
              disabledReason={
                !canManage
                  ? "Só o dono ou um administrador pode alterar."
                  : selected.status !== "active"
                    ? "Conta desativada. Ative em Contas do Mercado Livre."
                    : undefined
              }
            />
          </>
        }
      />

      {!selected.store_profile_completed_at ? (
        <Alert>
          <AlertTitle>Complete a configuração do Assistente de IA</AlertTitle>
          <AlertDescription>
            O agente de pós-venda usa as informações da loja (envio, nota fiscal, garantia, trocas) que você responde no{" "}
            <Link href="/assistente" className="font-medium underline underline-offset-4">
              Assistente de IA
            </Link>
            . Sem elas, ele vai deixar mais conversas para você.
          </AlertDescription>
        </Alert>
      ) : null}

      <HowItWorks
        title="Como o agente de pós-venda funciona"
        steps={[
          "Quando um comprador manda mensagem sobre uma compra, o agente lê a conversa inteira, os itens, o pagamento, o envio, o rastreio e a previsão de entrega.",
          "Se a resposta está nos dados do Mercado Livre ou nas informações da sua loja, ele responde na hora (até 350 caracteres, limite do ML).",
          "Se faltar informação ou o assunto for delicado, a conversa fica para você em Pós-venda, já com um rascunho pronto.",
        ]}
      />

      <Tabs defaultValue={tab} className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          {[
            { value: "configuracao", label: "Configuração", icon: SlidersHorizontalIcon },
            { value: "ensinadas", label: "Respostas ensinadas", icon: GraduationCapIcon, count: examples.length },
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
        <TabsContent value="configuracao">
          <AgentSettingsForm
            key={selected.id}
            accountId={selected.id}
            disabled={!canManage}
            initial={{
              policy: parseSensitivePolicy(selected.after_sale_sensitive_policy),
              threshold: afterSalePresetFor(Number(selected.after_sale_confidence_threshold)),
              signature: selected.after_sale_signature,
              instructions: selected.after_sale_instructions,
            }}
          />
        </TabsContent>
        <TabsContent value="ensinadas">
          <AfterSaleExamples key={selected.id} accountId={selected.id} examples={examples} canManage={canManage} />
        </TabsContent>
        <TabsContent value="testar">
          <AgentTestPanel key={selected.id} accountId={selected.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}
