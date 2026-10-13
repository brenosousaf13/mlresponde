import { after, NextResponse } from "next/server"

import { handleMessageNotification, processDueConversations } from "@/lib/after-sale/engine"
import { parseMessageNotification } from "@/lib/after-sale/notification"
import { processDueQuestions, processQuestion, reconcileQuestion } from "@/lib/answers/engine"
import { registerQuestion } from "@/lib/answers/ingest"
import { parseQuestionNotification } from "@/lib/answers/notification"
import { serverEnv } from "@/lib/env"
import { organizationIncludes } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"

export const maxDuration = 60

const ok = () => NextResponse.json({ ok: true })

/**
 * Notificações do Mercado Livre. O ML exige HTTP 200 em até 500 ms; se demorar, ele pode desligar os tópicos do app
 * ("fall back") e as notificações param de chegar. Por isso a resposta sai na hora, sem banco nem chamada ao ML, e o
 * trabalho continua depois (after). Notificação inválida ou de tópico que não usamos também recebe 200 (ignorada).
 * Se alguma notificação se perder, o cron de perguntas busca as perguntas novas no ML a cada ~10 s (lib/answers/poll.ts).
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ok()
  }

  const applicationId = serverEnv.mlClientId()
  const question = parseQuestionNotification(body, applicationId)
  if (question) {
    console.info(`[webhook] pergunta ${question.mlQuestionId} da conta ML ${question.mlUserId} (tentativa ${attempts(body)})`)
    after(() => handleQuestion(question.mlUserId, question.mlQuestionId))
    return ok()
  }
  const message = parseMessageNotification(body, applicationId)
  if (message) {
    console.info(`[webhook] mensagem ${message.messageId} da conta ML ${message.mlUserId} (tentativa ${attempts(body)})`)
    after(() => handleMessage(message.mlUserId, message.messageId))
  }
  return ok()
}

function attempts(body: unknown) {
  const value = (body as { attempts?: unknown }).attempts
  return typeof value === "number" ? value : "?"
}

async function handleQuestion(mlUserId: number, mlQuestionId: number) {
  try {
    const { data: account, error } = await createServiceClient()
      .from("ml_accounts")
      .select("id, organization_id, status")
      .eq("ml_user_id", mlUserId)
      .maybeSingle()
    if (error) throw error
    if (!account || account.status === "disconnected") return

    // registerQuestion devolve null quando a pergunta é de outra conta (ex.: o comprador também usa a maanu).
    const registered = await registerQuestion({
      organizationId: account.organization_id,
      mlAccountId: account.id,
      mlQuestionId,
    })
    if (registered?.isNew) await processQuestion(registered.id)
    else if (registered && ["needs_review", "failed"].includes(registered.status)) await reconcileQuestion(registered.id)
    await processDueQuestions(5)
  } catch (error) {
    console.error("[webhook] pergunta:", error instanceof Error ? error.message : error)
  }
}

/** Mensagem pós-venda: só para contas cujo plano em vigor inclui o pós-venda (as demais são ignoradas sem custo). */
async function handleMessage(mlUserId: number, messageId: string) {
  try {
    const { data: account, error } = await createServiceClient()
      .from("ml_accounts")
      .select("id, organization_id, status, organizations(plan, subscription_status, trial_ends_at)")
      .eq("ml_user_id", mlUserId)
      .maybeSingle()
    if (error) throw error
    if (!account || account.status === "disconnected") return
    if (!account.organizations || !organizationIncludes(account.organizations, "pos_venda")) return

    await handleMessageNotification(account, messageId)
    await processDueConversations(5)
  } catch (error) {
    console.error("[webhook] pós-venda:", error instanceof Error ? error.message : error)
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" })
}
