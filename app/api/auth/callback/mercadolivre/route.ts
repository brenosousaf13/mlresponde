import { NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/mercadolivre/auth'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=No+code+provided', request.url))
  }

  try {
    const data = await exchangeCodeForToken(code)
    
    const sellerId = data.user_id.toString()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    const expiresIn = data.expires_in

    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn)

    const supabase = await createClient()

    const { error: upsertError } = await supabase
      .from('ml_credentials')
      .upsert({
        seller_id: sellerId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'seller_id'
      })

    if (upsertError) {
      console.error('Error saving ML credentials:', upsertError)
      return NextResponse.redirect(new URL('/settings?error=Database+error', request.url))
    }

    return NextResponse.redirect(new URL('/settings?success=ml_connected', request.url))
  } catch (error: any) {
    console.error('Error during ML OAuth callback:', error)
    return NextResponse.redirect(new URL(`/settings?error=OAuth+error:+${encodeURIComponent(error?.message || 'Unknown')}`, request.url))
  }
}
