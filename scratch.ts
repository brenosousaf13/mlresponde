import { createClient } from '@supabase/supabase-js';
import { mlFetch } from './lib/mercadolivre/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function test() {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: creds, error } = await supabase.from('ml_credentials').select('seller_id, user_id').limit(1).single();
    if (error) throw error;
    
    console.log('Seller ID:', creds.seller_id, 'User ID:', creds.user_id);
    const sellerId = creds.seller_id;
    const userId = creds.user_id;
    
    const url = `/my/received_questions/search?status=ANSWERED&limit=2&sort_fields=date_created&sort_types=DESC`;
    const data = await mlFetch(sellerId, url);
    const q = data.questions[0];

    const { error: upsertError } = await supabase
      .from('training_examples')
      .upsert({
        user_id: userId,
        seller_id: sellerId,
        question_id: q.id.toString(),
        item_id: q.item_id,
        question_text: q.text,
        answer_text: q.answer.text,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'question_id'
      });

    console.log('Upsert Error:', upsertError);
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
