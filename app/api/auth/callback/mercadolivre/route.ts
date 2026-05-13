import { NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/mercadolivre/auth'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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

    // Precisamos do client com cookies pra saber qual usuário do SaaS fez o login
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/settings?error=User+not+authenticated', request.url))
    }

    // Usando admin client para dar bypass no RLS e inserir/atualizar as credenciais
    const supabase = createAdminClient()

    const { error: upsertError } = await supabase
      .from('ml_credentials')
      .upsert({
        user_id: user.id,
        seller_id: sellerId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'seller_id'
      })

    if (upsertError) {
      console.error('Error saving ML credentials:', upsertError)
      return NextResponse.redirect(new URL(`/settings?error=DB_Error:+${encodeURIComponent(upsertError.message || upsertError.details || 'Unknown')}`, request.url))
    }

    return NextResponse.redirect(new URL('/settings?success=ml_connected', request.url))
  } catch (error: any) {
    console.error('Error during ML OAuth callback:', error)
    return NextResponse.redirect(new URL(`/settings?error=OAuth+error:+${encodeURIComponent(error?.message || 'Unknown')}`, request.url))
  }
}
