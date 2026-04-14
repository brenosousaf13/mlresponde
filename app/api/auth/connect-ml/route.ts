import { NextResponse } from 'next/server'
import { getAuthorizationUrl } from '@/lib/mercadolivre/auth'

export async function GET() {
  const authUrl = getAuthorizationUrl()
  return NextResponse.redirect(authUrl)
}
