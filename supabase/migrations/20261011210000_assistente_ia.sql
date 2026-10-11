-- Assistente de IA: configuração guiada (perguntas sobre o negócio) por conta do Mercado Livre.
-- Spec: docs/superpowers/specs/2026-10-11-assistente-ia-design.md
-- Só acrescenta colunas (aditiva). O navegador continua só lendo (RLS da Fundação); escrita só pelo servidor.

alter table public.ml_accounts
  add column store_profile jsonb not null default '{}'::jsonb,
  add column store_setup_step integer not null default 0,
  add column store_profile_completed_at timestamptz;

alter table public.ml_accounts
  add constraint ml_accounts_store_profile_object check (jsonb_typeof(store_profile) = 'object'),
  add constraint ml_accounts_store_profile_size check (octet_length(store_profile::text) <= 60000),
  add constraint ml_accounts_store_setup_step_range check (store_setup_step between 0 and 100);

-- Respostas ensinadas: título do anúncio (quando criadas à mão para um anúncio) e data de edição.
alter table public.ai_examples
  add column item_title text check (char_length(item_title) <= 300),
  add column updated_at timestamptz not null default now();

create trigger ai_examples_set_updated_at before update on public.ai_examples
  for each row execute function public.set_updated_at();
