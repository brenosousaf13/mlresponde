import { createClient } from '@/lib/supabase/server'

const ML_CLIENT_ID = process.env.ML_CLIENT_ID
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI

export function getAuthorizationUrl() {
  return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${ML_REDIRECT_URI}`
}

export async function exchangeCodeForToken(code: string) {
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ML_CLIENT_ID!,
      client_secret: ML_CLIENT_SECRET!,
      code,
      redirect_uri: ML_REDIRECT_URI!,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }

  const data = await response.json()
  return data
}

export async function getValidToken(sellerId: string) {
  const supabase = await createClient()

  const { data: credentials, error: credentialsError } = await supabase
    .from('ml_credentials')
    .select('*')
    .eq('seller_id', sellerId)
    .single()

  if (credentialsError || !credentials) {
    throw new Error('No ML credentials found for this seller')
  }

  const now = new Date()
  const expiresAt = new Date(credentials.expires_at)

  if (now > new Date(expiresAt.getTime() - 5 * 60000)) {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_CLIENT_ID!,
        client_secret: ML_CLIENT_SECRET!,
        refresh_token: credentials.refresh_token,
      }).toString(),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    const data = await response.json()

    const newExpiresAt = new Date()
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + data.expires_in)

    await supabase
      .from('ml_credentials')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('seller_id', sellerId)

    return data.access_token
  }

  return credentials.access_token
}
