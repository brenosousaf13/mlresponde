import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // Para resolver o desafio do Mercado Livre, precisamos sempre
    // responder com 200 OK o mais rápido possível.
    
    // Opcional: Aqui poderemos ler o payload no futuro
    // const body = await request.json()
    // console.log("Webhook received:", body)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET() {
  // O Mercado Livre as vezes faz um ping via GET para testar se a URL existe
  return NextResponse.json({ status: 'Webhook is active' }, { status: 200 })
}
