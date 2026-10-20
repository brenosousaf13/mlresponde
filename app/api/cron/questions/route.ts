import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runQuestionRounds } from "@/lib/answers/poll"
import { serverEnv } from "@/lib/env"

export const dynamic = "force-dynamic"
// Uma consulta ao ML por minuto; a folga cobre a IA respondendo as perguntas encontradas e a fila de novas tentativas.
export const maxDuration = 120

function authorized(request: NextRequest) {
  const secret = serverEnv.cronSecret()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get("authorization") ?? "")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Perguntas (Vercel Cron a cada minuto, só em produção): busca no ML, uma vez, as perguntas novas de todas as contas
 * (rede de segurança caso a notificação do ML não chegue) e roda a fila de novas tentativas.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runQuestionRounds())
}
