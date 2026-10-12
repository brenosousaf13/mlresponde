-- Pós-venda com IA — exclusivo do plano Essencial.
-- Spec: docs/superpowers/specs/2026-10-11-pos-venda-design.md
-- Aditiva e retrocompatível: colunas novas em ml_accounts (com default) e tabelas novas (só a v2 usa).
-- Mesma regra das outras tabelas da v2: navegador só LÊ (RLS); toda escrita é do servidor (service role).
-- Além de ser membro da organização, o plano dela precisa incluir o pós-venda (a regra vale também no banco).

-- Planos que incluem o pós-venda. Espelho de lib/plans/plans.ts (PLAN_FEATURES): mudar nos dois lugares.
create or replace function public.plan_includes_after_sale(p_plan text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(p_plan) in ('essencial', 'admin'), false);
$$;

-- Organizações do usuário logado com o pós-venda no plano. Conjunto avaliado uma vez por consulta no RLS.
create or replace function public.current_user_after_sale_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id
   where m.user_id = (select auth.uid())
     and public.plan_includes_after_sale(o.plan);
$$;

revoke execute on function public.current_user_after_sale_organization_ids() from public, anon;
grant execute on function public.current_user_after_sale_organization_ids() to authenticated;

-- Configuração do agente de pós-venda (por conta do Mercado Livre). Começa pausado.
alter table public.ml_accounts
  add column after_sale_enabled boolean not null default false,
  add column after_sale_instructions text not null default ''
    check (char_length(after_sale_instructions) <= 4000),
  add column after_sale_confidence_threshold numeric(3, 2) not null default 0.85
    check (after_sale_confidence_threshold between 0.50 and 0.95),
  add column after_sale_sensitive_policy text not null default 'review'
    check (after_sale_sensitive_policy in ('review', 'guide')),
  add column after_sale_signature text not null default ''
    check (char_length(after_sale_signature) <= 80);

-- Uma linha por conversa de venda (pack do ML; sem pack, o id da venda faz o papel de pack).
create table public.ml_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  pack_id text not null check (pack_id ~ '^[0-9]{1,30}$'),
  order_ids text[] not null default '{}',
  buyer_id bigint,
  buyer_nickname text,
  item_id text,
  item_title text,
  item_thumbnail text,
  item_permalink text,
  items_count integer not null default 0,
  -- Resumo do pedido para a tela (itens, valores, pagamento, envio). Sem endereço nem dados pessoais.
  order_summary jsonb not null default '{}'::jsonb,
  order_status text,
  order_total numeric(14, 2),
  currency_id text,
  ordered_at timestamptz,
  shipment_id bigint,
  shipping_status text,
  shipping_substatus text,
  tracking_number text,
  logistic_type text,
  estimated_delivery_at timestamptz,
  -- Situação da conversa no ML (active | blocked + motivo) e reclamação/mediação aberta.
  ml_status text not null default 'active' check (ml_status in ('active', 'blocked')),
  ml_substatus text,
  claim_open boolean not null default false,
  max_message_length integer not null default 350 check (max_message_length between 1 and 5000),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'failed', 'needs_review', 'answered', 'blocked', 'archived')),
  review_reason text
    check (review_reason in (
      'ai_escalated', 'low_confidence', 'sensitive_topic', 'unsafe_answer', 'answer_too_long', 'auto_reply_off',
      'account_inactive', 'access_blocked', 'plan_inactive', 'claim_open', 'send_rejected', 'processing_error'
    )),
  last_message_at timestamptz,
  last_message_from text check (last_message_from in ('buyer', 'seller')),
  last_message_text text,
  last_answer_source text check (last_answer_source in ('ai', 'manual', 'external')),
  awaiting_since timestamptz,
  pending_count integer not null default 0,
  ai_draft text,
  ai_confidence numeric(4, 3),
  ai_reason text,
  ai_topic text,
  ai_model text,
  ai_tokens integer,
  answered_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  resync_requested boolean not null default false,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, pack_id)
);

create index ml_conversations_org_status_idx on public.ml_conversations (organization_id, status, last_message_at desc nulls last);
create index ml_conversations_org_last_idx on public.ml_conversations (organization_id, last_message_at desc nulls last, created_at desc);
create index ml_conversations_due_idx on public.ml_conversations (next_attempt_at)
  where status in ('pending', 'processing', 'failed');
create index ml_conversations_review_sync_idx on public.ml_conversations (synced_at)
  where status = 'needs_review';

create trigger ml_conversations_set_updated_at before update on public.ml_conversations
  for each row execute function public.set_updated_at();

-- Mensagens da conversa (cópia do ML para o histórico e para a IA). ml_message_id "local:..." = enviada por nós
-- e ainda não confirmada com o id do ML.
create table public.ml_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.ml_conversations (id) on delete cascade,
  ml_message_id text not null check (char_length(ml_message_id) between 1 and 120),
  sender text not null check (sender in ('buyer', 'seller')),
  source text not null check (source in ('buyer', 'ai', 'manual', 'external')),
  text text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  ml_status text,
  moderation_status text,
  moderation_reason text,
  sent_at timestamptz not null,
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conversation_id, ml_message_id)
);

create index ml_conversation_messages_conv_idx on public.ml_conversation_messages (conversation_id, sent_at);
create index ml_conversation_messages_org_idx on public.ml_conversation_messages (organization_id);

-- Respostas ensinadas ao agente de pós-venda.
create table public.after_sale_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  buyer_message text not null check (char_length(buyer_message) between 1 and 2000),
  answer_text text not null check (char_length(answer_text) between 1 and 1000),
  source_conversation_id uuid references public.ml_conversations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index after_sale_examples_account_idx on public.after_sale_examples (ml_account_id, created_at desc);
create index after_sale_examples_org_idx on public.after_sale_examples (organization_id);

-- Reserva uma conversa para processamento (evita dois processos na mesma conversa).
create or replace function public.claim_ml_conversation(p_id uuid, p_lock_seconds integer default 150)
returns setof public.ml_conversations
language sql
security definer
set search_path = ''
as $$
  update public.ml_conversations
     set status = 'processing',
         locked_until = now() + make_interval(secs => p_lock_seconds),
         attempts = attempts + 1,
         resync_requested = false
   where id = p_id
     and next_attempt_at <= now()
     and (
       status in ('pending', 'failed')
       or (status = 'processing' and (locked_until is null or locked_until < now()))
     )
  returning *;
$$;

-- Conversas prontas para (re)processar: novas, com nova tentativa vencida ou com lock expirado.
create or replace function public.due_ml_conversations(p_limit integer default 10)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.ml_conversations c
   where c.next_attempt_at <= now()
     and (
       c.status in ('pending', 'failed')
       or (c.status = 'processing' and (c.locked_until is null or c.locked_until < now()))
     )
   order by c.next_attempt_at
   limit greatest(1, least(p_limit, 50));
$$;

revoke execute on function public.claim_ml_conversation(uuid, integer) from public, anon, authenticated;
revoke execute on function public.due_ml_conversations(integer) from public, anon, authenticated;
grant execute on function public.claim_ml_conversation(uuid, integer) to service_role;
grant execute on function public.due_ml_conversations(integer) to service_role;

alter table public.ml_conversations enable row level security;
alter table public.ml_conversation_messages enable row level security;
alter table public.after_sale_examples enable row level security;

revoke all on table public.ml_conversations, public.ml_conversation_messages, public.after_sale_examples
  from anon, authenticated;
grant select on table public.ml_conversations, public.ml_conversation_messages, public.after_sale_examples
  to authenticated;
grant all on table public.ml_conversations, public.ml_conversation_messages, public.after_sale_examples
  to service_role;

create policy "Membros com o plano veem as conversas de pós-venda" on public.ml_conversations
  for select to authenticated
  using (organization_id in (select public.current_user_after_sale_organization_ids()));

create policy "Membros com o plano veem as mensagens de pós-venda" on public.ml_conversation_messages
  for select to authenticated
  using (organization_id in (select public.current_user_after_sale_organization_ids()));

create policy "Membros com o plano veem as respostas ensinadas do pós-venda" on public.after_sale_examples
  for select to authenticated
  using (organization_id in (select public.current_user_after_sale_organization_ids()));

alter publication supabase_realtime add table public.ml_conversations;
