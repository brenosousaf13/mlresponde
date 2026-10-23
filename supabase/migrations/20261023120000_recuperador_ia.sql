-- Recuperador: IA além do relato (Sessão 36). Dois usos novos da IA ficam registrados em ai_usage_events:
--  * recovery_suggest_action: "Sugerir ação" (contestar / não contestar / ressarcimento parcial) no detalhe da devolução;
--  * recovery_photo_review: conferência das fotos da revisão com visão, antes do envio.
-- Nenhum dos dois conta nas respostas do plano (só question_answer/after_sale_answer contam). Mesmos valores de antes + 2.
-- Aditiva: só alarga o CHECK; nenhuma linha muda. Sem GRANT novo (nenhuma tabela, view ou função nova).
alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check check (feature in (
  'question_answer', 'question_suggestion', 'assistant_test',
  'after_sale_answer', 'after_sale_suggestion', 'after_sale_test',
  'key_check',
  'listing_improvement',
  'reputation_claim_analysis',
  'recovery_return_message',
  'recovery_suggest_action',
  'recovery_photo_review'
));