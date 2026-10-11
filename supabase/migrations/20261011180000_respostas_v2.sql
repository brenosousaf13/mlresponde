-- Sub-projeto 2 — Respostas automáticas v2.
-- Spec: docs/superpowers/specs/2026-10-11-respostas-v2-design.md
-- Mesma regra da Fundação: navegador só lê (RLS por organização); escrita só pelo servidor (service role).

alter table public.ml_accounts
  add column auto_reply_enabled boolean not null default false,
  add column ai_confidence_threshold numeric(3, 2) not null default 0.75
    check (ai_confidence_threshold between 0.50 and 0.95),
  add column answer_tone text not null default 'cordial'
    check (answer_tone in ('cordial', 'profissional', 'descontraido')),
  add column answer_greeting text not null default '' check (char_length(answer_greeting) <= 200),
  add column answer_signature text not null default '' check (char_length(answer_signature) <= 200),
  add column store_briefing text not null default '' check (char_length(store_briefing) <= 5000);

create table public.ml_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  ml_question_id bigint not null unique,
  item_id text,
  item_title text,
  item_permalink text,
  item_thumbnail text,
  buyer_id bigint,
  question_text text not null default '',
  question_created_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'answered', 'needs_review', 'answered_outside', 'ignored', 'failed')),
  review_reason text
    check (review_reason in (
      'ai_escalated', 'low_confidence', 'unsafe_answer', 'answer_too_long', 'auto_reply_off',
      'blacklisted', 'account_inactive', 'access_blocked', 'processing_error'
    )),
  ai_draft text,
  ai_confidence numeric(4, 3),
  ai_reason text,
  ai_model text,
  ai_tokens integer,
  answer_text text,
  answer_source text check (answer_source in ('ai', 'manual', 'external')),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ml_questions_org_status_created_idx on public.ml_questions (organization_id, status, created_at desc);
create index ml_questions_org_created_idx on public.ml_questions (organization_id, created_at desc);
create index ml_questions_account_idx on public.ml_questions (ml_account_id);
create index ml_questions_due_idx on public.ml_questions (next_attempt_at)
  where status in ('pending', 'processing', 'failed');

create trigger ml_questions_set_updated_at before update on public.ml_questions
  for each row execute function public.set_updated_at();

create table public.ai_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  item_id text,
  question_text text not null check (char_length(question_text) between 1 and 2000),
  answer_text text not null check (char_length(answer_text) between 1 and 2000),
  source_question_id uuid references public.ml_questions (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_examples_account_item_idx on public.ai_examples (ml_account_id, item_id, created_at desc);
create index ai_examples_org_idx on public.ai_examples (organization_id);

create table public.item_blacklist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  item_id text not null check (item_id ~ '^[A-Z]{3}[0-9]{6,15}$'),
  item_title text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ml_account_id, item_id)
);

create index item_blacklist_org_idx on public.item_blacklist (organization_id);

-- Reserva uma pergunta para processamento (evita dois processos na mesma pergunta).
create or replace function public.claim_ml_question(p_id uuid, p_lock_seconds integer default 120)
returns setof public.ml_questions
language sql
security definer
set search_path = ''
as $$
  update public.ml_questions
     set status = 'processing',
         locked_until = now() + make_interval(secs => p_lock_seconds),
         attempts = attempts + 1
   where id = p_id
     and next_attempt_at <= now()
     and (
       status in ('pending', 'failed')
       or (status = 'processing' and (locked_until is null or locked_until < now()))
     )
  returning *;
$$;

-- Perguntas prontas para (re)processar: novas, com nova tentativa vencida ou com lock expirado.
create or replace function public.due_ml_questions(p_limit integer default 10)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from public.ml_questions q
   where q.next_attempt_at <= now()
     and (
       q.status in ('pending', 'failed')
       or (q.status = 'processing' and (q.locked_until is null or q.locked_until < now()))
     )
   order by q.next_attempt_at
   limit greatest(1, least(p_limit, 50));
$$;

-- Números do painel. Roda com as permissões de quem chama (RLS garante só a própria organização).
create or replace function public.question_stats(
  p_organization_id uuid,
  p_since timestamptz,
  p_ml_account_id uuid default null
)
returns table (
  total bigint,
  answered_ai bigint,
  answered_manual bigint,
  answered_outside bigint,
  awaiting_review bigint,
  avg_ai_seconds numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where q.status = 'answered' and q.answer_source = 'ai'),
    count(*) filter (where q.status = 'answered' and q.answer_source = 'manual'),
    count(*) filter (where q.status = 'answered_outside'),
    count(*) filter (where q.status in ('needs_review', 'failed')),
    round(avg(extract(epoch from (q.answered_at - coalesce(q.question_created_at, q.created_at))))
      filter (where q.status = 'answered' and q.answer_source = 'ai'), 1)
  from public.ml_questions q
  where q.organization_id = p_organization_id
    and q.created_at >= p_since
    and (p_ml_account_id is null or q.ml_account_id = p_ml_account_id);
$$;

revoke execute on function public.claim_ml_question(uuid, integer) from public, anon, authenticated;
revoke execute on function public.due_ml_questions(integer) from public, anon, authenticated;
grant execute on function public.claim_ml_question(uuid, integer) to service_role;
grant execute on function public.due_ml_questions(integer) to service_role;
revoke execute on function public.question_stats(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.question_stats(uuid, timestamptz, uuid) to authenticated;

alter table public.ml_questions enable row level security;
alter table public.ai_examples enable row level security;
alter table public.item_blacklist enable row level security;

revoke all on table public.ml_questions, public.ai_examples, public.item_blacklist from anon, authenticated;
grant select on table public.ml_questions, public.ai_examples, public.item_blacklist to authenticated;
grant all on table public.ml_questions, public.ai_examples, public.item_blacklist to service_role;

create policy "Membros veem as perguntas da organização" on public.ml_questions
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "Membros veem as respostas ensinadas da organização" on public.ai_examples
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "Membros veem os anúncios bloqueados da organização" on public.item_blacklist
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

alter publication supabase_realtime add table public.ml_questions;
