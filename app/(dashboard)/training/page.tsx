import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SyncButton from './sync-button'

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TrainingPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const pageStr = typeof searchParams?.page === 'string' ? searchParams.page : '1'
  const page = parseInt(pageStr, 10) || 1
  const pageSize = 10
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const supabaseAdmin = createAdminClient()

  // 1. Descobrir qual o seller_id desse usuário
  const { data: credentials } = await supabaseAdmin
    .from('ml_credentials')
    .select('seller_id')
    .eq('user_id', user.id)
    .single()

  const sellerId = credentials?.seller_id

  let examples: any[] = []
  let totalCount = 0

  if (sellerId) {
    const { data, count } = await supabaseAdmin
      .from('training_examples')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to)
    
    examples = data || []
    totalCount = count || 0
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Treinamento da IA</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Sincronize as perguntas que você já respondeu no Mercado Livre. A IA lerá essas perguntas no futuro para imitar o seu estilo e saber os detalhes dos seus produtos.
        </p>
      </div>
      
      {!sellerId ? (
        <div className="p-6 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200">
          Você precisa conectar sua conta do Mercado Livre na aba Configurações antes de sincronizar o treinamento.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sincronização Ativa</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Clique abaixo para varrer as últimas 200 perguntas respondidas no seu Mercado Livre.
            </p>
            <SyncButton sellerId={sellerId} />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Exemplos em Memória ({totalCount})</h3>
            
            {examples.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Nenhum exemplo sincronizado ainda.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {examples.map(ex => (
                  <div key={ex.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="text-xs text-gray-500 mb-2 font-mono">Produto ID: {ex.item_id}</div>
                    <div className="mb-2">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">P: </span>
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{ex.question_text}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-green-700 dark:text-green-500 text-sm">R: </span>
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{ex.answer_text}</span>
                    </div>
                  </div>
                ))}

                {/* Controles de Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Página <span className="font-medium text-gray-900 dark:text-white">{page}</span> de <span className="font-medium text-gray-900 dark:text-white">{totalPages}</span>
                    </div>
                    <div className="flex gap-2">
                      <Link 
                        href={`?page=${page - 1}`}
                        className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${page <= 1 ? 'pointer-events-none opacity-50 bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'}`}
                      >
                        Anterior
                      </Link>
                      <Link 
                        href={`?page=${page + 1}`}
                        className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${page >= totalPages ? 'pointer-events-none opacity-50 bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'}`}
                      >
                        Próxima
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
