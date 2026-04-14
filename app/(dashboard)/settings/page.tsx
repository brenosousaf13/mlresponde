import { createAdminClient } from '@/lib/supabase/server'
import KnowledgeForm from './knowledge-form'

export default async function SettingsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const success = searchParams?.success;
  const error = searchParams?.error;

  const supabase = createAdminClient()
  
  const { data: credentials } = await supabase
    .from('ml_credentials')
    .select('seller_id, updated_at')
    .single()

  let kb_data = null
  if (credentials?.seller_id) {
    const { data } = await supabase
      .from('knowledge_base')
      .select('content')
      .eq('seller_id', credentials.seller_id)
      .single()
    kb_data = data
  }

  const isConnected = !!credentials

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Configurações</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie a integração com o Mercado Livre e sua Base de Conhecimento.</p>
      </div>
      
      {success === 'ml_connected' && (
        <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg dark:bg-green-900/30 dark:border-green-800 dark:text-green-400 shadow-sm animate-in fade-in zoom-in-95 duration-300">
          <div className="flex gap-2 items-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            <span className="font-medium">Conta ML conectada com sucesso!</span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 shadow-sm">
          <span className="font-medium">Erro ao conectar conta:</span> {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden text-left p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Integração — Mercado Livre
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Conecte sua conta do Mercado Livre para que o IA possa postar respostas automaticamente aos seus compradores.
        </p>
        
        {isConnected ? (
          <div>
            <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </span>
              <div className="text-sm">
                <p className="font-semibold text-gray-900 dark:text-white">Conectado (Seller ID: {credentials.seller_id})</p>
                <p className="text-gray-500 dark:text-gray-400">Última atualização em {new Date(credentials.updated_at).toLocaleDateString()}</p>
              </div>
            </div>
            
            <a href="/api/auth/connect-ml" className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600 transition-colors">
              Reconectar Conta
            </a>
          </div>
        ) : (
          <a href="/api/auth/connect-ml" className="inline-flex items-center gap-2 justify-center py-2.5 px-6 border border-transparent rounded-lg shadow-md text-sm font-semibold text-blue-900 bg-[#FFE600] hover:bg-[#FFD100] transition-colors">
             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10.8 19.3L13.7 15H9.6L12.7 8H6V22H11.5L10.8 19.3ZM23 10V11C23 16 19 20 14 21V19C17.9 18.2 21 15 21 11V10H23Z" /></svg>
             Conectar conta do Mercado Livre
          </a>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden text-left p-6">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white mb-2">
          Base de Conhecimento da IA (GPT-4o)
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Preencha o manual de comportamento e atendimento que a Inteligência artificial deverá obedecer antes de gerar respostas.
        </p>

        <KnowledgeForm 
          sellerId={credentials?.seller_id?.toString()} 
          initialContent={kb_data?.content || ''} 
        />
      </div>
    </div>
  )
}
