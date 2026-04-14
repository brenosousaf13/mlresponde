import { createAdminClient } from '@/lib/supabase/server'
import LiveQuestions, { QuestionJob } from './live-questions'

export default async function DashboardPage() {
  const supabase = createAdminClient() // Usar admin pra ler os jobs de todo o ambiente sem ter dor de cabeça com RLS temporariamente

  // Busca inicial pelo Server-Side Rendering
  const { data: initialJobs, error } = await supabase
    .from('question_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Painel de Atendimento (Ao Vivo)</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Acompanhe a inteligência artificial respondendo as perguntas do Mercado Livre em tempo real.</p>
      </div>
      
      <div className="mt-4">
        <LiveQuestions initialJobs={(initialJobs || []) as QuestionJob[]} />
      </div>
    </div>
  )
}
