import { NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/mercadolivre/auth'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  // Helper para salvar logs silenciosamente (sem quebrar o fluxo)
  const saveLog = async (errorType: string, errorDetails: any, userId?: string) => {
    try {
      const supabaseAdmin = createAdminClient()
      await supabaseAdmin.from('connection_logs').insert({
        user_id: userId || null,
        error_type: errorType,
        error_details: errorDetails,
        url_accessed: request.url
      })
    } catch (logError) {
      console.error('Falha crítica ao salvar log no banco:', logError)
    }
  }

  if (!code) {
    await saveLog('NO_CODE_PROVIDED', { message: 'Nenhum código retornado pelo Mercado Livre' })
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
      await saveLog('USER_NOT_AUTHENTICATED', { message: 'Usuário do painel Meli Fácil não está logado durante o callback' })
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
      await saveLog('DB_UPSERT_ERROR', upsertError, user.id)
      return NextResponse.redirect(new URL(`/settings?error=DB_Error:+${encodeURIComponent(upsertError.message || upsertError.details || 'Unknown')}`, request.url))
    }

    return NextResponse.redirect(new URL('/settings?success=ml_connected', request.url))
  } catch (error: any) {
    console.error('Error during ML OAuth callback:', error)
    
    // Pega o erro completo (seja axios error com response, ou error comum de js)
    const errDetails = {
      message: error?.message || 'Unknown Error',
      stack: error?.stack,
      response_data: error?.response?.data,
      response_status: error?.response?.status
    }
    
    await saveLog('OAUTH_EXCHANGE_ERROR', errDetails)
    return NextResponse.redirect(new URL(`/settings?error=OAuth+error:+${encodeURIComponent(error?.message || 'Unknown')}`, request.url))
  }
}
