import { timingSafeEqual } from "node:crypto"

import { after, NextResponse, type NextRequest } from "next/server"

import { processConversation, syncUnreadConversations } from "@/lib/after-sale/engine"
import { processQuestion } from "@/lib/answers/engine"
import { syncUnansweredQuestions } from "@/lib/answers/ingest"
import { planIncludes } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"

import { getCurrentUser } from "@/lib/dal/app-context"
import { connectMlAccount } from "@/lib/mercadolivre/accounts"
import { fetchMlMe } from "@/lib/mercadolivre/api"
import { exchangeAuthorizationCode } from "@/lib/mercadolivre/oauth"
import {
  ML_OAUTH_COOKIE,
  ML_OAUTH_COOKIE_PATH,
  unsealOAuthPayload,
} from "@/lib/mercadolivre/oauth-cookie"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const RESULT_PARAM: Record<string, string> = {
  connected: "conectada",
  reconnected: "reconectada",
  connected_inactive: "inativa",
  conflict: "conflito",
}

function sameValue(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: NextRequest) {
  const finish = (result: string) => {
    const response = NextResponse.redirect(new URL(`/contas?ml=${result}`, request.url))
    response.cookies.set(ML_OAUTH_COOKIE, "", { path: ML_OAUTH_COOKIE_PATH, maxAge: 0 })
    return response
  }

  const { searchParams } = request.nextUrl
  const payload = unsealOAuthPayload(request.cookies.get(ML_OAUTH_COOKIE)?.value)
  if (!payload || payload.expiresAt < Date.now()) return finish("expirado")

  if (searchParams.get("error")) return finish("cancelado")

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code || !state || !sameValue(state, payload.state)) return finish("invalido")

  const user = await getCurrentUser()
  if (!user || user.id !== payload.userId) return finish("invalido")

  try {
    const tokens = await exchangeAuthorizationCode(code, payload.verifier)
    const mlUser = await fetchMlMe(tokens.access_token)
    if (mlUser.id !== tokens.user_id) return finish("invalido")

    const result = await connectMlAccount({
      organizationId: payload.organizationId,
      userId: user.id,
      tokens,
      mlUser,
    })
    if (result.kind === "connected" || result.kind === "reconnected") {
      const accountId = result.accountId
      after(async () => {
        try {
          const { created } = await syncUnansweredQuestions(accountId)
          for (const id of created) await processQuestion(id)
          // Pós-venda (plano Essencial): traz as conversas com mensagens não lidas.
          const { data: organization } = await createServiceClient()
            .from("organizations")
            .select("plan")
            .eq("id", payload.organizationId)
            .single()
          if (planIncludes(organization?.plan, "pos_venda")) {
            for (const id of await syncUnreadConversations(accountId)) await processConversation(id)
          }
        } catch (error) {
          console.error("[ml-oauth-callback] sync:", error instanceof Error ? error.message : error)
        }
      })
    }
    return finish(RESULT_PARAM[result.kind])
  } catch (error) {
    console.error("[ml-oauth-callback]", error instanceof Error ? error.message : error)
    return finish("erro")
  }
}
