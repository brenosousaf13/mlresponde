import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { serverEnv } from "@/lib/env"
import { claimsHook, processClaimAnalyses } from "@/lib/reputation/claims-engine"
import { runReputationSync } from "@/lib/reputation/engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = serverEnv.cronSecret()
  if (!secret) return false
  const expected = Buffer.from("Bearer " + secret)
  const received = Buffer.from(request.headers.get("authorization") ?? "")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Escudo de Reputação (Vercel Cron a cada 2 min, só em produção; até a Sessão 30 era a cada minuto): termômetro (30 min
 * por conta), despachos (10 min), reclamações (5 min, com detalhe e mensagens das abertas), os e-mails dos alertas urgentes
 * (lib/reputation/engine.ts) e a fila da IA das reclamações (até 3 análises, lib/reputation/claims-engine.ts). Até 140
 * chamadas ao ML por rodada.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const startedAt = Date.now()
  const result = await runReputationSync({ claimsHook })
  let analyses = 0
  try {
    analyses = await processClaimAnalyses(startedAt + 55_000)
  } catch (error) {
    console.error("[reputação] fila da IA:", error instanceof Error ? error.message : error)
  }
  return NextResponse.json({ ...result, analyses })
}
