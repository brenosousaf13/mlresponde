import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SyncButton from './sync-button'

export const dynamic = 'force-dynamic'

export default async function TrainingPage() {
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
  if (sellerId) {
    const { data } = await supabaseAdmin
      .from('training_examples')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    
    examples = data || []
  }

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
              Clique abaixo para varrer as últimas perguntas respondidas no seu Mercado Livre.
            </p>
            <SyncButton sellerId={sellerId} />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Exemplos em Memória ({examples.length})</h3>
            
            {examples.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Nenhum exemplo sincronizado ainda.</p>
            ) : (
              <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
