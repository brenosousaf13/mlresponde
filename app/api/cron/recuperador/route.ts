import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { serverEnv } from "@/lib/env"
import { runRecoverySync } from "@/lib/recovery/engine"

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
 * Recuperador (Vercel Cron a cada minuto, só em produção): devoluções de cada conta (5 min; 2 min com revisão pendente;
 * 1 min enquanto o Raio-X de 90 dias carrega), alertas e o Raio-X (lib/recovery/engine.ts). Até 60 chamadas ao ML por
 * rodada. Os e-mails dos alertas urgentes saem na rodada do Escudo (/api/cron/reputacao).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runRecoverySync())
}
