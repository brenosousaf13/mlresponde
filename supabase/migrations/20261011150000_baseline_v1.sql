-- Baseline da v1: espelho EXATO do schema de produção em 2026-10-11.
-- Fonte: docs/db/prod-schema-2026-10-11.json (inventário só leitura de prod).
--
-- Regras:
--   * Em produção esta migração NÃO deve ser executada: as tabelas já existem. No cutover, marcar como aplicada com
--     `supabase migration repair --status applied <versão>` no projeto de prod, e só então rodar as migrações da v2.
--   * Mantém de propósito os problemas da v1 (ex.: policy aberta em question_jobs, tokens em texto puro), para
--     refletir prod fielmente. Correções entram em migrações próprias da v2.
--   * A tabela connection_logs, citada no código da v1, não existe em prod e por isso não está aqui.

create table public.ml_credentials (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  seller_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamp with time zone not null,
  user_id uuid,
  auto_reply_enabled boolean default false,
  constraint ml_credentials_pkey PRIMARY KEY (id),
  constraint ml_credentials_seller_id_key UNIQUE (seller_id),
  constraint ml_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
alter table public.ml_credentials enable row level security;
create policy "Usuário só vê as próprias credenciais" on public.ml_credentials as permissive for all
  using (auth.uid() = user_id);
grant all on table public.ml_credentials to anon, authenticated, service_role;

create table public.knowledge_base (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  seller_id text not null,
  content text not null,
  user_id uuid,
  constraint knowledge_base_pkey PRIMARY KEY (id),
  constraint knowledge_base_seller_id_key UNIQUE (seller_id),
  constraint knowledge_base_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
alter table public.knowledge_base enable row level security;
create policy "Usuário só acessa própria base" on public.knowledge_base as permissive for all
  using (auth.uid() = user_id);
grant all on table public.knowledge_base to anon, authenticated, service_role;

create table public.training_examples (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  user_id uuid not null,
  seller_id text not null,
  question_id text not null,
  item_id text not null,
  question_text text not null,
  answer_text text not null,
  constraint training_examples_pkey PRIMARY KEY (id),
  constraint training_examples_question_id_key UNIQUE (question_id),
  constraint training_examples_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
alter table public.training_examples enable row level security;
create policy "Usuário só acessa próprios exemplos" on public.training_examples as permissive for all
  using (auth.uid() = user_id);
grant all on table public.training_examples to anon, authenticated, service_role;

create table public.question_jobs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  question_id text not null,
  item_id text not null,
  seller_id text not null,
  question_text text not null,
  status text default 'pending'::text not null,
  ai_response text,
  error_message text,
  item_title text,
  item_url text,
  constraint question_jobs_pkey PRIMARY KEY (id),
  constraint question_jobs_question_id_key UNIQUE (question_id)
);
create index question_jobs_created_at_idx on public.question_jobs using btree (created_at DESC);
create index question_jobs_status_idx on public.question_jobs using btree (status);
alter table public.question_jobs enable row level security;
create policy "Autenticados podem ver tudo" on public.question_jobs as permissive for all
  using (auth.role() = 'authenticated'::text);
grant all on table public.question_jobs to anon, authenticated, service_role;

alter publication supabase_realtime add table public.question_jobs;
