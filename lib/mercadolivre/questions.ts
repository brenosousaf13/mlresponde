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
  variations?: Array<{
    id: number;
    price: number;
    available_quantity: number;
    attribute_combinations: Array<{ name: string; value_name: string }>;
  }>;
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

export async function fetchAnsweredQuestions(sellerId: string, limit: number = 50, offset: number = 0) {
  // Busca as perguntas com status ANSWERED ordenadas pelas mais recentes
  const url = `/my/received_questions/search?status=ANSWERED&limit=${limit}&offset=${offset}&sort_fields=date_created&sort_types=DESC`
  const data = await mlFetch(sellerId, url)
  return data
}

export async function fetchMultipleAnsweredQuestions(sellerId: string, totalTarget: number = 200) {
  const limit = 50; // Limite máximo da API do ML
  const pages = Math.ceil(totalTarget / limit);
  const promises = [];
  
  for (let i = 0; i < pages; i++) {
    promises.push(fetchAnsweredQuestions(sellerId, limit, i * limit));
  }
  
  const results = await Promise.all(promises);
  let allQuestions: any[] = [];
  
  for (const res of results) {
    if (res && res.questions) {
      allQuestions = allQuestions.concat(res.questions);
    }
  }
  
  return { questions: allQuestions };
}
