import { getValidToken } from './auth'

/**
 * Função utilitária para fazer chamadas autenticadas na API do Mercado Livre.
 * Ele gerencia o token automaticamente usando o seller_id.
 */
export async function mlFetch(sellerId: string, endpoint: string, options: RequestInit = {}) {
  // Pega um token válido (renova se estiver expirado)
  const token = await getValidToken(sellerId)

  // Assegura que passaremos no cabeçalho
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json')
  headers.set('Accept', 'application/json')

  // Chama a API do Mercado Livre
  const url = endpoint.startsWith('http') ? endpoint : `https://api.mercadolibre.com${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Tratamento de erro padronizado para as respostas da API deles
  if (!response.ok) {
    let errorMessage = `Erro na API do ML (${response.status})`
    try {
      const errorData = await response.json()
      errorMessage = `Erro ML: ${errorData.message || JSON.stringify(errorData)}`
    } catch {
      // Ignora erro de parsing
    }
    throw new Error(errorMessage)
  }

  return response.json()
}
