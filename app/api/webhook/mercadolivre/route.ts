import { after, NextResponse } from "next/server"

import { handleMessageNotification, processDueConversations } from "@/lib/after-sale/engine"
import { parseMessageNotification } from "@/lib/after-sale/notification"
import { processDueQuestions, processQuestion, reconcileQuestion } from "@/lib/answers/engine"
import { registerQuestion } from "@/lib/answers/ingest"
import { parseQuestionNotification } from "@/lib/answers/notification"
import { serverEnv } from "@/lib/env"
import { planIncludes } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"

export const maxDuration = 60

const ok = () => NextResponse.json({ ok: true })

// O Mercado Livre exige 200 rápido; qualquer notificação inválida também recebe 200 (e é ignorada).
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
    await handleQuestion(question.mlUserId, question.mlQuestionId)
    return ok()
  }
  const message = parseMessageNotification(body, applicationId)
  if (message) await handleMessage(message.mlUserId, message.messageId)
  return ok()
}

async function handleQuestion(mlUserId: number, mlQuestionId: number) {
  try {
    const admin = createServiceClient()
    const { data: account } = await admin
      .from("ml_accounts")
      .select("id, organization_id, status")
      .eq("ml_user_id", mlUserId)
      .maybeSingle()
    if (!account || account.status === "disconnected") return

    const registered = await registerQuestion({
      organizationId: account.organization_id,
      mlAccountId: account.id,
      mlQuestionId,
    })

    after(async () => {
      try {
        if (registered?.isNew) await processQuestion(registered.id)
        else if (registered && ["needs_review", "failed"].includes(registered.status)) {
          await reconcileQuestion(registered.id)
        }
        await processDueQuestions(5)
      } catch (error) {
        console.error("[webhook] processamento:", error instanceof Error ? error.message : error)
      }
    })
  } catch (error) {
    console.error("[webhook] registro:", error instanceof Error ? error.message : error)
  }
}

/** Mensagem pós-venda: só para contas cujo plano inclui o pós-venda (as demais são ignoradas sem custo). */
async function handleMessage(mlUserId: number, messageId: string) {
  try {
    const admin = createServiceClient()
    const { data: account } = await admin
      .from("ml_accounts")
      .select("id, organization_id, status, organizations(plan)")
      .eq("ml_user_id", mlUserId)
      .maybeSingle()
    if (!account || account.status === "disconnected") return
    if (!planIncludes(account.organizations?.plan, "pos_venda")) return

    after(async () => {
      try {
        await handleMessageNotification(account, messageId)
        await processDueConversations(5)
      } catch (error) {
        console.error("[webhook] pós-venda:", error instanceof Error ? error.message : error)
      }
    })
  } catch (error) {
    console.error("[webhook] pós-venda (registro):", error instanceof Error ? error.message : error)
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" })
}
