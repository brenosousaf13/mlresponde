import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data, error } = await supabase
    .from('question_jobs')
    .update({ 
      status: 'error', 
      error_message: 'Processamento interrompido por Timeout da Vercel. Falha ao responder.',
      updated_at: new Date().toISOString()
    })
    .eq('status', 'processing')
  
  console.log('Update result:', { data, error })
}

run()
