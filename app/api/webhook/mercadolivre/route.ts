import { after, NextResponse } from "next/server"

import { processDueQuestions, processQuestion, reconcileQuestion } from "@/lib/answers/engine"
import { registerQuestion } from "@/lib/answers/ingest"
import { parseQuestionNotification } from "@/lib/answers/notification"
import { serverEnv } from "@/lib/env"
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

  const notification = parseQuestionNotification(body, serverEnv.mlClientId())
  if (!notification) return ok()

  try {
    const admin = createServiceClient()
    const { data: account } = await admin
      .from("ml_accounts")
      .select("id, organization_id, status")
      .eq("ml_user_id", notification.mlUserId)
      .maybeSingle()
    if (!account || account.status === "disconnected") return ok()

    const registered = await registerQuestion({
      organizationId: account.organization_id,
      mlAccountId: account.id,
      mlQuestionId: notification.mlQuestionId,
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

  return ok()
}

export async function GET() {
  return NextResponse.json({ status: "ok" })
}
