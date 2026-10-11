-- Modo "responder sempre": a IA responde toda pergunta; o que ela não souber recebe a mensagem padrão da loja.
-- Spec: docs/superpowers/specs/2026-10-11-modo-sempre-e-leitura-do-anuncio-design.md
-- Aditiva e retrocompatível: colunas novas com padrão que mantém o comportamento atual ("careful").

alter table public.ml_accounts
  add column answer_mode text not null default 'careful',
  add column fallback_answer text not null default '';

alter table public.ml_accounts
  add constraint ml_accounts_answer_mode_check check (answer_mode in ('careful', 'always')),
  add constraint ml_accounts_fallback_answer_length check (char_length(fallback_answer) <= 1000);

comment on column public.ml_accounts.answer_mode is
  'careful = o que a IA não souber fica para o vendedor; always = a IA sempre responde (mensagem padrão quando não souber).';
comment on column public.ml_accounts.fallback_answer is
  'Mensagem padrão do modo always (sem saudação/assinatura). Vazio = texto padrão do sistema.';

-- Preenchido quando a resposta enviada foi a mensagem padrão: guarda por que a IA não respondeu de verdade.
alter table public.ml_questions
  add column fallback_reason text;

alter table public.ml_questions
  add constraint ml_questions_fallback_reason_check
    check (fallback_reason in ('ai_escalated', 'low_confidence', 'unsafe_answer', 'answer_too_long'));
