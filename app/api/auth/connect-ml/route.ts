import { NextResponse } from 'next/server'
import { getAuthorizationUrl } from '@/lib/mercadolivre/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authUrl = getAuthorizationUrl()
  
  console.log('--- DEBUG: GENERATED AUTH URL ---')
  console.log(authUrl)
  console.log('ENV ML_CLIENT_ID:', process.env.ML_CLIENT_ID)
  console.log('ENV ML_REDIRECT_URI:', process.env.ML_REDIRECT_URI)
  console.log('--------------------------------')

  // Ao invés de redirecionar direto, vamos mostrar o link na tela
  // para você conferir exatamente o que está sendo gerado
  return new NextResponse(`
    <html>
      <body style="font-family: sans-serif; padding: 40px; background: #222; color: white;">
        <h2>Debug de Conexão M.L.</h2>
        <p>URL gerada pelo nosso sistema:</p>
        <pre style="background: black; padding: 15px; border-radius: 5px; overflow-x: auto;">${authUrl}</pre>
        <p><strong>Client ID:</strong> ${process.env.ML_CLIENT_ID}</p>
        <p><strong>Redirect URI:</strong> ${process.env.ML_REDIRECT_URI}</p>
        <br/><br/>
        <a href="${authUrl}" style="padding: 10px 20px; background: blue; color: white; text-decoration: none; border-radius: 5px;">
          Clicar para ir pro Mercado Livre
        </a>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  })
}
