import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { serverEnv } from "@/lib/env"
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
 * Escudo de Reputação (Vercel Cron a cada minuto, só em produção): termômetro (30 min por conta), despachos (10 min),
 * reclamações (5 min) e os e-mails dos alertas urgentes (lib/reputation/engine.ts). Até 80 chamadas ao ML por rodada.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runReputationSync())
}
