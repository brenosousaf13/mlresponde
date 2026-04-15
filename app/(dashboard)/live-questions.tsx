'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface QuestionJob {
  id: string;
  question_id: string;
  seller_id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  ai_response?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export default function LiveQuestions({ initialJobs }: { initialJobs: QuestionJob[] }) {
  const [jobs, setJobs] = useState<QuestionJob[]>(initialJobs)
  const supabase = createClient()

  useEffect(() => {
    // Inscreve no canal "public" da tabela "question_jobs" para Live Updates do Supabase
    const channel = supabase
      .channel('realtime_question_jobs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'question_jobs' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as QuestionJob
            setJobs((prev) => [newJob, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as QuestionJob
            setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)))
          } else if (payload.eventType === 'DELETE') {
            setJobs((prev) => prev.filter((j) => j.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const getStatusBadge = (status: QuestionJob['status']) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">🟠 Pendente (Aguardando IA)</span>
      case 'processing':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">🔵 Processando (Formulando a resposta...)</span>
      case 'done':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">🟢 Respondido</span>
      case 'error':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">🔴 Erro ao sincronizar</span>
      default:
        return null
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Nenhum atendimento</h3>
        <p className="mt-1 text-sm text-gray-500">O robô está escutando sua conta do ML. Aguardando a primeira pergunta!</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-4">
      {jobs.map((job) => (
        <div key={job.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Q-ID: <span className="font-mono text-xs">{job.question_id}</span> • {new Date(job.created_at).toLocaleString('pt-BR')}
            </div>
            <div>{getStatusBadge(job.status)}</div>
          </div>

          <div className="flex flex-col gap-3">
            {job.ai_response && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-l-4 border-green-500">
                <span className="text-xs uppercase tracking-wider text-green-600 font-bold block mb-1">🤖 Resposta da IA</span>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{job.ai_response}</p>
              </div>
            )}
            
            {job.error_message && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-800/30">
                <strong>Log do erro:</strong> {job.error_message}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
