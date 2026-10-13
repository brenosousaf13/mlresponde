-- Planos da maanu (Sessão 20, 2026-10-13): Starter, Pro e Escala + teste grátis, e "Melhorias de anúncio".
-- Spec: docs/superpowers/specs/2026-10-13-planos-design.md
-- Espelho das regras de lib/plans/plans.ts (mudar nos dois lugares).
--
-- Aditiva e retrocompatível:
--  * 2 colunas NULAS em organizations (limite de respostas definido pelo administrador e ciclo de cobrança);
--  * funções novas ou com a mesma assinatura (create or replace mantém os privilégios);
--  * CHECKs de review_reason (perguntas e pós-venda) e de ai_usage_events.feature AMPLIADOS: recriados com os mesmos
--    valores + 1 novo cada (nenhum dado muda);
--  * 1 tabela nova (listing_improvements) com RLS e GRANT explícito (privilégios padrão são negados, CEREBRO §6.1f);
--  * gatilhos em organizations: trocar o plano preenche o limite de contas do plano; baixar o limite desativa as contas
--    ativas mais novas que passaram dele (o histórico fica; reativar é escolha do cliente dentro do limite).

-- ---------------------------------------------------------------------------------------------- organizations

alter table public.organizations
  add column if not exists monthly_answers_limit integer
    check (monthly_answers_limit is null or monthly_answers_limit between 0 and 1000000),
  add column if not exists billing_cycle text
    check (billing_cycle is null or billing_cycle in ('monthly', 'annual'));

comment on column public.organizations.monthly_answers_limit is
  'Respostas automáticas por mês definidas pelo administrador. Nulo = o limite do plano (lib/plans/plans.ts).';
comment on column public.organizations.billing_cycle is
  'Ciclo da assinatura: monthly | annual. Nulo = sem assinatura (teste, cortesia).';

-- ---------------------------------------------------------------------------------------------- regras do plano

-- Planos com pós-venda: Pro, Escala, o interno (admin) e o teste grátis ('trial' = sem plano e teste em andamento).
create or replace function public.plan_includes_after_sale(p_plan text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(trim(p_plan)) in ('pro', 'escala', 'admin', 'trial'), false);
$$;

-- Contas do Mercado Livre ativas de cada plano (nulo = plano desconhecido: não mexe no limite).
create or replace function public.plan_ml_accounts_limit(p_plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(p_plan))
    when 'starter' then 1
    when 'pro' then 3
    when 'escala' then 10
    when 'admin' then 10
    when 'trial' then 1
    else null
  end;
$$;

-- Plano em vigor: o cadastrado; sem plano e com o teste grátis no prazo = 'trial'; senão nulo.
create or replace function public.organization_plan_id(p_plan text, p_subscription_status text, p_trial_ends_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when nullif(trim(p_plan), '') is not null then lower(trim(p_plan))
    when p_subscription_status = 'trialing' and p_trial_ends_at > now() then 'trial'
    else null
  end;
$$;

revoke execute on function public.plan_ml_accounts_limit(text) from public, anon;
revoke execute on function public.organization_plan_id(text, text, timestamptz) from public, anon;
grant execute on function public.plan_includes_after_sale(text) to authenticated, service_role;
grant execute on function public.plan_ml_accounts_limit(text) to authenticated, service_role;
grant execute on function public.organization_plan_id(text, text, timestamptz) to authenticated, service_role;

-- RLS do pós-venda: membro da organização E plano em vigor com pós-venda (agora inclui o teste grátis).
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
     and public.plan_includes_after_sale(public.organization_plan_id(o.plan, o.subscription_status, o.trial_ends_at));
$$;

-- ---------------------------------------------------------------------------------------------- limite de contas

-- Trocou o plano sem mexer no limite de contas → usa o limite do plano novo.
create or replace function public.organizations_apply_plan_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer;
begin
  if new.plan is distinct from old.plan and new.ml_accounts_limit = old.ml_accounts_limit then
    v_limit := public.plan_ml_accounts_limit(new.plan);
    if v_limit is not null then
      new.ml_accounts_limit := v_limit;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_apply_plan_limits on public.organizations;
create trigger organizations_apply_plan_limits
  before update of plan, ml_accounts_limit on public.organizations
  for each row execute function public.organizations_apply_plan_limits();

-- Limite de contas baixou → as contas ativas mais novas acima do limite ficam inativas (nada é apagado).
create or replace function public.organizations_enforce_active_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ml_accounts a
     set status = 'inactive'
   where a.id in (
     select x.id
       from (
         select b.id, row_number() over (order by b.created_at, b.id) as position
           from public.ml_accounts b
          where b.organization_id = new.id
            and b.status = 'active'
       ) x
      where x.position > new.ml_accounts_limit
   );
  return null;
end;
$$;

drop trigger if exists organizations_enforce_active_accounts on public.organizations;
create trigger organizations_enforce_active_accounts
  after update on public.organizations
  for each row
  when (new.ml_accounts_limit < old.ml_accounts_limit)
  execute function public.organizations_enforce_active_accounts();

revoke execute on function public.organizations_apply_plan_limits() from public, anon, authenticated;
revoke execute on function public.organizations_enforce_active_accounts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- respostas automáticas

-- Respostas automáticas no período: perguntas respondidas pela IA (inclusive a mensagem padrão do modo "Responder
-- sempre") + mensagens de pós-venda enviadas pelo agente. security invoker: o navegador só conta o que o RLS deixa
-- ver (a própria organização); o servidor (service role) conta tudo.
create or replace function public.organization_ai_answers(p_organization_id uuid, p_from timestamptz, p_to timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    (select count(*)
       from public.ml_questions q
      where q.organization_id = p_organization_id
        and q.answer_source = 'ai'
        and q.status = 'answered'
        and q.answered_at >= p_from
        and q.answered_at < p_to)
    +
    (select count(*)
       from public.ml_conversation_messages m
      where m.organization_id = p_organization_id
        and m.source = 'ai'
        and m.sent_at >= p_from
        and m.sent_at < p_to)
  )::integer;
$$;

revoke execute on function public.organization_ai_answers(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.organization_ai_answers(uuid, timestamptz, timestamptz) to authenticated, service_role;

create index if not exists ml_questions_org_ai_answered_idx on public.ml_questions (organization_id, answered_at)
  where answer_source = 'ai' and status = 'answered';
create index if not exists ml_conversation_messages_org_ai_sent_idx on public.ml_conversation_messages (organization_id, sent_at)
  where source = 'ai';

-- Pergunta/conversa que ficou com o vendedor porque o limite do plano acabou.
alter table public.ml_questions drop constraint if exists ml_questions_review_reason_check;
alter table public.ml_questions add constraint ml_questions_review_reason_check check (review_reason in (
  'ai_escalated', 'low_confidence', 'unsafe_answer', 'answer_too_long', 'auto_reply_off',
  'blacklisted', 'account_inactive', 'access_blocked', 'processing_error',
  'answers_limit'
));

alter table public.ml_conversations drop constraint if exists ml_conversations_review_reason_check;
alter table public.ml_conversations add constraint ml_conversations_review_reason_check check (review_reason in (
  'ai_escalated', 'low_confidence', 'sensitive_topic', 'unsafe_answer', 'answer_too_long', 'auto_reply_off',
  'account_inactive', 'access_blocked', 'plan_inactive', 'claim_open', 'send_rejected', 'processing_error',
  'answers_limit'
));

-- Nova função da IA registrada no uso: as análises de Melhorias de anúncio.
alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check check (feature in (
  'question_answer', 'question_suggestion', 'assistant_test',
  'after_sale_answer', 'after_sale_suggestion', 'after_sale_test',
  'key_check',
  'listing_improvement'
));

-- ---------------------------------------------------------------------------------------------- melhorias de anúncio

-- Uma linha por análise: a IA lê as perguntas de um anúncio e sugere o que mudar nele para os compradores não
-- precisarem perguntar. 'processing' = em andamento (reserva a cota; some se falhar); 'ready' = pronta.
create table public.listing_improvements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  item_id text not null check (item_id ~ '^[A-Z]{3}[0-9]{6,15}$'),
  item_title text check (char_length(item_title) <= 300),
  item_permalink text check (char_length(item_permalink) <= 500),
  item_thumbnail text check (char_length(item_thumbnail) <= 500),
  status text not null default 'processing' check (status in ('processing', 'ready')),
  questions_analyzed integer not null default 0 check (questions_analyzed >= 0),
  questions_from timestamptz,
  questions_to timestamptz,
  -- Resultado da IA já validado pelo servidor: { summary, suggestions: [...] } (lib/listing-improvements/parse.ts).
  result jsonb not null default '{}'::jsonb check (pg_column_size(result) <= 200000),
  -- Índices das sugestões que o vendedor marcou como feitas.
  done_suggestions integer[] not null default '{}',
  model text check (char_length(model) <= 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.listing_improvements is
  'Análises de Melhorias de anúncio (planos Pro e Escala): sugestões da IA com base nas perguntas de cada anúncio.';

create index listing_improvements_org_created_idx on public.listing_improvements (organization_id, created_at desc);
create index listing_improvements_item_idx on public.listing_improvements (ml_account_id, item_id, created_at desc);
-- No máximo uma análise em andamento por anúncio (evita gastar a cota duas vezes com um clique duplo).
create unique index listing_improvements_one_processing_idx on public.listing_improvements (ml_account_id, item_id)
  where status = 'processing';

create trigger listing_improvements_set_updated_at before update on public.listing_improvements
  for each row execute function public.set_updated_at();

alter table public.listing_improvements enable row level security;
revoke all on table public.listing_improvements from anon, authenticated;
grant select on table public.listing_improvements to authenticated;
grant all on table public.listing_improvements to service_role;

create policy "Membros veem as melhorias de anúncio da organização" on public.listing_improvements
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

-- Anúncios com mais perguntas desde p_from (base das Melhorias de anúncio). security invoker: respeita o RLS.
create or replace function public.listing_question_ranking(
  p_organization_id uuid,
  p_from timestamptz,
  p_ml_account_id uuid default null,
  p_limit integer default 30
)
returns table (
  ml_account_id uuid,
  item_id text,
  item_title text,
  item_thumbnail text,
  item_permalink text,
  questions integer,
  open_questions integer,
  last_question_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    q.ml_account_id,
    q.item_id,
    (array_agg(q.item_title order by q.created_at desc) filter (where q.item_title is not null))[1],
    (array_agg(q.item_thumbnail order by q.created_at desc) filter (where q.item_thumbnail is not null))[1],
    (array_agg(q.item_permalink order by q.created_at desc) filter (where q.item_permalink is not null))[1],
    count(*)::integer,
    (count(*) filter (where q.status in ('needs_review', 'failed')))::integer,
    max(coalesce(q.question_created_at, q.created_at))
  from public.ml_questions q
  where q.organization_id = p_organization_id
    and q.item_id is not null
    and q.question_text <> ''
    and q.created_at >= p_from
    and (p_ml_account_id is null or q.ml_account_id = p_ml_account_id)
  group by q.ml_account_id, q.item_id
  order by count(*) desc, max(q.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke execute on function public.listing_question_ranking(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.listing_question_ranking(uuid, timestamptz, uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------- painel do administrador

-- Uso do plano de uma organização no período escolhido pelo painel (mês ou teste grátis).
create or replace function public.admin_organization_usage(p_organization_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return (
    select jsonb_build_object(
      'monthly_answers_limit', o.monthly_answers_limit,
      'billing_cycle', o.billing_cycle,
      'created_at', o.created_at,
      'answers', public.organization_ai_answers(o.id, p_from, p_to),
      'improvements', (
        select count(*) from public.listing_improvements l
         where l.organization_id = o.id and l.status = 'ready' and l.created_at >= p_from and l.created_at < p_to
      )
    )
    from public.organizations o
    where o.id = p_organization_id
  );
end;
$$;

revoke execute on function public.admin_organization_usage(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_organization_usage(uuid, timestamptz, timestamptz) to authenticated;

-- Assinatura e dados da loja: mesma função da migração painel_admin, agora com o limite de respostas e o ciclo.
create or replace function public.admin_update_organization(
  p_organization_id uuid,
  p_changes jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'name', 'plan', 'subscription_status', 'trial_ends_at', 'current_period_end',
    'billing_exempt', 'ml_accounts_limit', 'monthly_price', 'monthly_answers_limit', 'billing_cycle'
  ];
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_diff_before jsonb := '{}'::jsonb;
  v_diff_after jsonb := '{}'::jsonb;
begin
  perform public.admin_assert();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'INVALID_CHANGES';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_allowed) then
      raise exception 'INVALID_FIELD %', v_key;
    end if;
  end loop;
  if p_changes ? 'plan' and nullif(p_changes ->> 'plan', '') is not null
     and (p_changes ->> 'plan') !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'INVALID_PLAN';
  end if;

  select to_jsonb(o) into v_before from public.organizations o where o.id = p_organization_id for update;
  if v_before is null then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  update public.organizations o
     set name = case when p_changes ? 'name' then trim(p_changes ->> 'name') else o.name end,
         plan = case when p_changes ? 'plan' then nullif(trim(coalesce(p_changes ->> 'plan', '')), '') else o.plan end,
         subscription_status = case when p_changes ? 'subscription_status'
           then p_changes ->> 'subscription_status' else o.subscription_status end,
         trial_ends_at = case when p_changes ? 'trial_ends_at'
           then (p_changes ->> 'trial_ends_at')::timestamptz else o.trial_ends_at end,
         current_period_end = case when p_changes ? 'current_period_end'
           then (p_changes ->> 'current_period_end')::timestamptz else o.current_period_end end,
         billing_exempt = case when p_changes ? 'billing_exempt'
           then (p_changes ->> 'billing_exempt')::boolean else o.billing_exempt end,
         ml_accounts_limit = case when p_changes ? 'ml_accounts_limit'
           then (p_changes ->> 'ml_accounts_limit')::integer else o.ml_accounts_limit end,
         monthly_price = case when p_changes ? 'monthly_price'
           then (p_changes ->> 'monthly_price')::numeric else o.monthly_price end,
         monthly_answers_limit = case when p_changes ? 'monthly_answers_limit'
           then (p_changes ->> 'monthly_answers_limit')::integer else o.monthly_answers_limit end,
         billing_cycle = case when p_changes ? 'billing_cycle'
           then nullif(trim(coalesce(p_changes ->> 'billing_cycle', '')), '') else o.billing_cycle end
   where o.id = p_organization_id
  returning to_jsonb(o) into v_after;

  foreach v_key in array v_allowed loop
    if (v_before -> v_key) is distinct from (v_after -> v_key) then
      v_diff_before := v_diff_before || jsonb_build_object(v_key, v_before -> v_key);
      v_diff_after := v_diff_after || jsonb_build_object(v_key, v_after -> v_key);
    end if;
  end loop;

  if v_diff_after <> '{}'::jsonb then
    perform public.admin_write_audit(
      'organization.update', 'organization', p_organization_id::text, p_organization_id,
      coalesce(nullif(left(p_context ->> 'summary', 300), ''), 'Assinatura e dados da loja alterados'),
      jsonb_build_object('before', v_diff_before, 'after', v_diff_after),
      p_context
    );
  end if;

  return v_diff_after;
end;
$$;
