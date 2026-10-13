import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runQuestionRounds } from "@/lib/answers/poll"
import { serverEnv } from "@/lib/env"

export const dynamic = "force-dynamic"
// A rotina consulta o ML durante ~50 s (a cada ~10 s); a folga cobre a IA respondendo a última pergunta encontrada.
export const maxDuration = 120

function authorized(request: NextRequest) {
  const secret = serverEnv.cronSecret()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get("authorization") ?? "")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Perguntas (Vercel Cron a cada minuto, só em produção): busca no ML as perguntas novas de todas as contas a cada ~10 s
 * (não depende da notificação do ML chegar) e roda a fila de novas tentativas.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runQuestionRounds())
}
