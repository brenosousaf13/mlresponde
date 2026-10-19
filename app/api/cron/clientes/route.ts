import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runCustomerSync } from "@/lib/customers/engine"
import { serverEnv } from "@/lib/env"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = serverEnv.cronSecret()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get("authorization") ?? "")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Clientes (Vercel Cron a cada minuto, só em produção): importação dos últimos 12 meses de vendas de cada conta,
 * conferência das vendas novas ou alteradas a cada 10 minutos e cidade/UF dos clientes (lib/customers/engine.ts).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runCustomerSync())
}
