import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LiveQuestions, { QuestionJob } from './live-questions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
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

  const sellerIds = credentials?.map(c => c.seller_id) || []

  // Se não tem conta ML conectada, retorna array vazio (a tela vai mandar ele esperar perguntas, ou podemos sugerir conectar)
  let initialJobs: any[] = []
  
  if (sellerIds.length > 0) {
    // 2. Buscar as perguntas que pertencem apenas aos seller_ids desse usuário
    const { data } = await supabaseAdmin
      .from('question_jobs')
      .select('*')
      .in('seller_id', sellerIds)
      .order('created_at', { ascending: false })
      .limit(20)
    
    initialJobs = data || []
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Painel de Atendimento (Ao Vivo)</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Acompanhe a inteligência artificial respondendo as perguntas do Mercado Livre em tempo real.</p>
      </div>
      
      <div className="mt-4">
        <LiveQuestions initialJobs={(initialJobs || []) as QuestionJob[]} sellerIds={sellerIds} />
      </div>
    </div>
  )
}
