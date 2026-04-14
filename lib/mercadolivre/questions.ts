import { mlFetch } from './client'

export interface MLQuestion {
  id: number;
  seller_id: number;
  text: string;
  item_id: string;
  status: string;
  date_created: string;
}

export interface MLItem {
  id: string;
  title: string;
  price: number;
  permalink: string;
  attributes: Array<{ name: string; value_name: string }>;
}

export async function fetchQuestion(sellerId: string, questionId: string): Promise<MLQuestion> {
  // api_version=4 é a mais recomendada pelo ML para questões
  return mlFetch(sellerId, `/questions/${questionId}?api_version=4`)
}

export async function fetchItem(sellerId: string, itemId: string): Promise<MLItem> {
  return mlFetch(sellerId, `/items/${itemId}`)
}

export async function postAnswer(sellerId: string, questionId: string, text: string) {
  return mlFetch(sellerId, `/answers`, {
    method: 'POST',
    body: JSON.stringify({
      question_id: parseInt(questionId, 10),
      text,
    }),
  })
}
