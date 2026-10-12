-- Painel do administrador da plataforma.
-- Spec: docs/superpowers/specs/2026-10-12-painel-admin-design.md
-- Aditiva e retrocompatível: só cria tabelas, colunas nulas, um índice e funções novas (a v1 não usa nada disto).
--
-- Segurança: o painel lê e altera dados SÓ pelas funções admin_* (security definer). Toda função começa com
-- admin_assert(), que confere no próprio banco, a partir do JWT verificado pelo PostgREST:
--   usuário logado + profiles.is_platform_admin + sessão aal2 com TOTP (verificação em 2 etapas) feito há até 12 horas.
-- Assim, mesmo um erro no servidor não expõe dados: sem sessão de administrador verificada, a chamada falha aqui.
-- As alterações gravam o histórico (admin_audit_log, só inclusão) na mesma transação.

-- ---------------------------------------------------------------------------------------------- colunas novas

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Último uso do app (atualizado no máximo a cada 15 min). Base dos "usuários ativos" do painel do administrador.';

alter table public.organizations
  add column if not exists monthly_price numeric(10, 2)
    check (monthly_price is null or (monthly_price >= 0 and monthly_price <= 1000000));

comment on column public.organizations.monthly_price is
  'Mensalidade em R$ combinada com o cliente (opcional). Base do MRR do painel até o gateway de cobrança existir.';

-- Consultas da plataforma inteira por período (painel do administrador). BRIN: minúsculo e ideal para created_at
-- sempre crescente.
create index if not exists ml_questions_created_brin_idx on public.ml_questions using brin (created_at);

-- ---------------------------------------------------------------------------------------------- uso da IA

-- Uma linha por chamada à OpenAI (respostas, sugestões, testes, pós-venda). Custo calculado no servidor com a tabela de
-- preços do código no momento da chamada (lib/ai/pricing.ts): mudança de preço não reescreve o passado.
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  ml_account_id uuid references public.ml_accounts (id) on delete set null,
  feature text not null check (feature in (
    'question_answer', 'question_suggestion', 'assistant_test',
    'after_sale_answer', 'after_sale_suggestion', 'after_sale_test'
  )),
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  success boolean not null default true,
  error text check (char_length(error) <= 300),
  latency_ms integer check (latency_ms >= 0),
  question_id uuid references public.ml_questions (id) on delete set null,
  conversation_id uuid references public.ml_conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_usage_events_created_idx on public.ai_usage_events (created_at);
create index ai_usage_events_org_created_idx on public.ai_usage_events (organization_id, created_at);
create index ai_usage_events_account_idx on public.ai_usage_events (ml_account_id) where ml_account_id is not null;
create index ai_usage_events_question_idx on public.ai_usage_events (question_id) where question_id is not null;
create index ai_usage_events_conversation_idx on public.ai_usage_events (conversation_id) where conversation_id is not null;

-- ---------------------------------------------------------------------------------------------- configurações da plataforma

create table public.platform_settings (
  id boolean primary key default true check (id),
  -- Pausa geral da IA (botão de emergência): nenhuma chamada à OpenAI sai enquanto estiver ligada.
  ai_paused boolean not null default false,
  ai_paused_reason text not null default '' check (char_length(ai_paused_reason) <= 300),
  ai_paused_at timestamptz,
  ai_paused_by uuid references auth.users (id) on delete set null,
  usd_brl_rate numeric(8, 4) not null default 5.50 check (usd_brl_rate between 1 and 50),
  monthly_fixed_costs_brl numeric(12, 2) not null default 0 check (monthly_fixed_costs_brl between 0 and 10000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create trigger platform_settings_set_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- notas internas e auditoria

-- Notas internas sobre o cliente (o cliente não lê: tabela separada de organizations, que os membros leem).
create table public.admin_organization_notes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Histórico do painel. Sem FKs de propósito: o registro sobrevive à exclusão do usuário ou da organização.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$' and char_length(action) <= 80),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 120),
  organization_id uuid,
  summary text not null default '' check (char_length(summary) <= 500),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 32768),
  ip text check (char_length(ip) <= 100),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_org_idx on public.admin_audit_log (organization_id, created_at desc) where organization_id is not null;
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_id, action, created_at desc);

-- Só inclusão: nem o servidor (service role) altera ou apaga o histórico.
create or replace function public.admin_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ADMIN_AUDIT_APPEND_ONLY'
    using hint = 'O histórico do painel do administrador não pode ser alterado nem apagado.';
end;
$$;

create trigger admin_audit_log_no_update_delete before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_append_only();
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_log_append_only();

-- ---------------------------------------------------------------------------------------------- privilégios das tabelas

alter table public.ai_usage_events enable row level security;
alter table public.platform_settings enable row level security;
alter table public.admin_organization_notes enable row level security;
alter table public.admin_audit_log enable row level security;
-- Nenhuma policy: o navegador (anon/authenticated) não lê nem escreve. O painel usa as funções admin_*.

revoke all on table
  public.ai_usage_events,
  public.platform_settings,
  public.admin_organization_notes,
  public.admin_audit_log
from anon, authenticated;

revoke all on table public.ai_usage_events from service_role;
grant select, insert on table public.ai_usage_events to service_role;
revoke all on table public.platform_settings from service_role;
grant select on table public.platform_settings to service_role;
grant all on table public.admin_organization_notes to service_role;
revoke all on table public.admin_audit_log from service_role;
grant select, insert on table public.admin_audit_log to service_role;

-- ---------------------------------------------------------------------------------------------- funções internas

-- A sessão atual é de administrador da plataforma com verificação em 2 etapas recente? Senão, erro.
create or replace function public.admin_assert()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_amr jsonb := v_claims -> 'amr';
  v_fresh boolean := false;
begin
  if auth.uid() is null or coalesce(v_claims ->> 'aal', '') <> 'aal2' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_typeof(v_amr) = 'array' then
    select exists (
      select 1
      from jsonb_array_elements(v_amr) as e(entry)
      where (
          jsonb_typeof(e.entry) = 'object'
          and e.entry ->> 'method' = 'totp'
          and coalesce((e.entry ->> 'timestamp')::numeric, 0) >= extract(epoch from now()) - 43200
        )
        or (jsonb_typeof(e.entry) = 'string' and e.entry #>> '{}' = 'totp')
    ) into v_fresh;
  end if;

  if not v_fresh
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_platform_admin) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- Grava uma linha do histórico com o administrador da sessão (uso interno das funções admin_*).
create or replace function public.admin_write_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_organization_id uuid,
  p_summary text,
  p_details jsonb,
  p_context jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (
    actor_id, actor_email, action, target_type, target_id, organization_id, summary, details, ip, user_agent
  )
  values (
    auth.uid(),
    (select u.email::text from auth.users u where u.id = auth.uid()),
    p_action,
    p_target_type,
    left(p_target_id, 120),
    p_organization_id,
    left(coalesce(p_summary, ''), 500),
    coalesce(p_details, '{}'::jsonb),
    left(nullif(p_context ->> 'ip', ''), 100),
    left(nullif(p_context ->> 'user_agent', ''), 400)
  );
$$;

-- Situação comercial da organização (espelho de computeAccess em lib/access/access.ts, com mais detalhe).
create or replace function public.admin_org_status(
  p_plan text,
  p_billing_exempt boolean,
  p_subscription_status text,
  p_trial_ends_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_plan = 'admin' then 'internal'
    when p_billing_exempt then 'courtesy'
    when p_subscription_status = 'active' then 'active'
    when p_subscription_status = 'past_due' then 'past_due'
    when p_subscription_status = 'canceled' then 'canceled'
    when p_trial_ends_at > now() then 'trial'
    else 'trial_expired'
  end;
$$;

-- Etapa de ativação do cliente (do cadastro até a IA respondendo).
create or replace function public.admin_org_stage(
  p_email_confirmed boolean,
  p_onboarded boolean,
  p_billing_completed boolean,
  p_ml_total integer,
  p_configured boolean,
  p_auto_reply_on boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when not p_email_confirmed then 'unconfirmed'
    when not p_onboarded or not p_billing_completed then 'onboarding'
    when p_ml_total = 0 then 'no_ml'
    when not p_configured then 'setup'
    when not p_auto_reply_on then 'ai_off'
    else 'live'
  end;
$$;

-- Uma linha por organização com tudo o que o painel mostra/filtra (cliente, dono, contas, uso, custo).
create or replace function public.admin_org_rows()
returns table (
  organization_id uuid,
  name text,
  plan text,
  status text,
  stage text,
  subscription_status text,
  billing_exempt boolean,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  monthly_price numeric,
  ml_accounts_limit integer,
  created_at timestamptz,
  owner_id uuid,
  owner_email text,
  owner_name text,
  owner_whatsapp text,
  owner_email_confirmed boolean,
  owner_banned boolean,
  onboarded boolean,
  billing_completed boolean,
  document_type text,
  document text,
  legal_name text,
  members integer,
  last_seen_at timestamptz,
  ml_ever integer,
  ml_total integer,
  ml_active integer,
  ml_invalid integer,
  ml_nicknames text,
  configured boolean,
  auto_reply_on boolean,
  after_sale_on boolean,
  questions_30d integer,
  ai_answers_30d integer,
  open_now integer,
  ai_calls_30d integer,
  ai_tokens_30d bigint,
  ai_cost_30d_usd numeric,
  ai_cost_month_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_30d timestamptz := now() - interval '30 days';
begin
  perform public.admin_assert();

  return query
  with owners as (
    select distinct on (m.organization_id) m.organization_id, m.user_id
    from public.organization_members m
    order by m.organization_id, (m.role = 'owner') desc, m.created_at
  ),
  member_stats as (
    select
      m.organization_id,
      count(*)::integer as members,
      max(greatest(p.last_seen_at, u.last_sign_in_at)) as last_seen_at
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    group by m.organization_id
  ),
  accounts as (
    select
      a.organization_id,
      count(*)::integer as ml_ever,
      (count(*) filter (where a.status <> 'disconnected'))::integer as ml_total,
      (count(*) filter (where a.status = 'active'))::integer as ml_active,
      (count(*) filter (where a.status <> 'disconnected' and a.token_status = 'invalid'))::integer as ml_invalid,
      string_agg(coalesce(a.nickname, a.ml_user_id::text), ' · ' order by a.created_at) as ml_nicknames,
      bool_or(a.store_profile_completed_at is not null) as configured,
      bool_or(a.status = 'active' and a.auto_reply_enabled) as auto_reply_on,
      bool_or(a.status = 'active' and a.after_sale_enabled) as after_sale_on
    from public.ml_accounts a
    group by a.organization_id
  ),
  recent_questions as (
    select
      q.organization_id,
      count(*)::integer as questions_30d,
      (count(*) filter (where q.status = 'answered' and q.answer_source = 'ai'))::integer as ai_answers_30d
    from public.ml_questions q
    where q.created_at >= v_30d
    group by q.organization_id
  ),
  open_questions as (
    select q.organization_id, count(*)::integer as open_now
    from public.ml_questions q
    where q.status in ('needs_review', 'failed')
    group by q.organization_id
  ),
  usage as (
    select
      e.organization_id,
      (count(*) filter (where e.created_at >= v_30d))::integer as calls_30d,
      coalesce(sum(e.total_tokens) filter (where e.created_at >= v_30d), 0)::bigint as tokens_30d,
      coalesce(sum(e.cost_usd) filter (where e.created_at >= v_30d), 0) as cost_30d,
      coalesce(sum(e.cost_usd) filter (where e.created_at >= v_month), 0) as cost_month
    from public.ai_usage_events e
    where e.created_at >= least(v_30d, v_month)
      and e.organization_id is not null
    group by e.organization_id
  )
  select
    o.id,
    o.name,
    o.plan,
    public.admin_org_status(o.plan, o.billing_exempt, o.subscription_status, o.trial_ends_at),
    public.admin_org_stage(
      u.email_confirmed_at is not null,
      p.onboarding_completed_at is not null,
      b.organization_id is not null or coalesce(p.is_platform_admin, false),
      coalesce(ac.ml_total, 0),
      coalesce(ac.configured, false),
      coalesce(ac.auto_reply_on, false)
    ),
    o.subscription_status,
    o.billing_exempt,
    o.trial_ends_at,
    o.current_period_end,
    o.monthly_price,
    o.ml_accounts_limit,
    o.created_at,
    ow.user_id,
    u.email::text,
    p.full_name,
    p.whatsapp,
    u.email_confirmed_at is not null,
    coalesce(u.banned_until > now(), false),
    p.onboarding_completed_at is not null,
    b.organization_id is not null,
    b.document_type,
    b.document,
    b.legal_name,
    coalesce(ms.members, 0),
    ms.last_seen_at,
    coalesce(ac.ml_ever, 0),
    coalesce(ac.ml_total, 0),
    coalesce(ac.ml_active, 0),
    coalesce(ac.ml_invalid, 0),
    coalesce(ac.ml_nicknames, ''),
    coalesce(ac.configured, false),
    coalesce(ac.auto_reply_on, false),
    coalesce(ac.after_sale_on, false),
    coalesce(rq.questions_30d, 0),
    coalesce(rq.ai_answers_30d, 0),
    coalesce(oq.open_now, 0),
    coalesce(us.calls_30d, 0),
    coalesce(us.tokens_30d, 0)::bigint,
    coalesce(us.cost_30d, 0),
    coalesce(us.cost_month, 0)
  from public.organizations o
  left join owners ow on ow.organization_id = o.id
  left join auth.users u on u.id = ow.user_id
  left join public.profiles p on p.id = ow.user_id
  left join public.billing_profiles b on b.organization_id = o.id
  left join member_stats ms on ms.organization_id = o.id
  left join accounts ac on ac.organization_id = o.id
  left join recent_questions rq on rq.organization_id = o.id
  left join open_questions oq on oq.organization_id = o.id
  left join usage us on us.organization_id = o.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------- leitura do painel

-- Visão geral: números da plataforma, séries de 30 dias, funil de ativação, listas e alertas.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_prev_month timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')
    at time zone 'America/Sao_Paulo';
  v_first_day date := (now() at time zone 'America/Sao_Paulo')::date - 29;
  v_orgs jsonb;
  v_users jsonb;
  v_accounts jsonb;
  v_questions jsonb;
  v_ai jsonb;
  v_signups_daily jsonb;
  v_ai_daily jsonb;
  v_alerts jsonb;
  v_platform jsonb;
begin
  perform public.admin_assert();

  with o as materialized (select * from public.admin_org_rows()),
  customers as (select * from o where o.status <> 'internal'),
  cohort as (select * from customers c where c.created_at >= now() - interval '30 days')
  select jsonb_build_object(
    'total', (select count(*) from customers),
    'by_status', (
      select coalesce(jsonb_object_agg(s.status, s.total), '{}'::jsonb)
      from (select c.status, count(*) as total from customers c group by c.status) s
    ),
    'internal', (select count(*) from o where o.status = 'internal'),
    'mrr', (select coalesce(sum(c.monthly_price), 0) from customers c where c.status = 'active'),
    'paying', (select count(*) from customers c where c.status = 'active'),
    'paying_without_price', (select count(*) from customers c where c.status = 'active' and c.monthly_price is null),
    'funnel', (
      select jsonb_build_object(
        'signed_up', count(*),
        'confirmed', count(*) filter (where c.owner_email_confirmed),
        'onboarded', count(*) filter (where c.onboarded and c.billing_completed),
        'connected_ml', count(*) filter (where c.ml_ever > 0),
        'configured_ai', count(*) filter (where c.configured),
        'enabled_ai', count(*) filter (where c.auto_reply_on),
        'first_ai_answer', count(*) filter (where exists (
          select 1 from public.ml_questions q
          where q.organization_id = c.organization_id and q.status = 'answered' and q.answer_source = 'ai'
        )),
        'paying', count(*) filter (where c.status = 'active')
      )
      from cohort c
    ),
    'recent_signups', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select c.organization_id, c.name, c.owner_name, c.owner_email, c.created_at, c.status, c.stage, c.ml_total
        from customers c
        order by c.created_at desc
        limit 8
      ) r
    ),
    'trials_ending', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.trial_ends_at), '[]'::jsonb)
      from (
        select c.organization_id, c.name, c.owner_name, c.owner_email, c.owner_whatsapp, c.trial_ends_at, c.stage,
               c.ai_answers_30d
        from customers c
        where c.status = 'trial' and c.trial_ends_at <= now() + interval '3 days'
        order by c.trial_ends_at
        limit 10
      ) r
    )
  )
  into v_orgs;

  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where u.email_confirmed_at is not null),
    'new_today', count(*) filter (where u.created_at >= v_today),
    'new_7d', count(*) filter (where u.created_at >= now() - interval '7 days'),
    'new_30d', count(*) filter (where u.created_at >= now() - interval '30 days'),
    'new_prev_30d', count(*) filter (
      where u.created_at >= now() - interval '60 days' and u.created_at < now() - interval '30 days'
    ),
    'active_today', count(*) filter (where greatest(p.last_seen_at, u.last_sign_in_at) >= v_today),
    'active_7d', count(*) filter (where greatest(p.last_seen_at, u.last_sign_in_at) >= now() - interval '7 days'),
    'active_30d', count(*) filter (where greatest(p.last_seen_at, u.last_sign_in_at) >= now() - interval '30 days')
  )
  into v_users
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.deleted_at is null
    and not coalesce(p.is_platform_admin, false);

  select jsonb_build_object(
    'connected', count(*) filter (where a.status <> 'disconnected'),
    'active', count(*) filter (where a.status = 'active'),
    'invalid_token', count(*) filter (where a.status <> 'disconnected' and a.token_status = 'invalid'),
    'auto_reply_on', count(*) filter (where a.status = 'active' and a.auto_reply_enabled),
    'after_sale_on', count(*) filter (where a.status = 'active' and a.after_sale_enabled)
  )
  into v_accounts
  from public.ml_accounts a;

  select jsonb_build_object(
    'today', count(*) filter (where q.created_at >= v_today),
    'last_7d', count(*) filter (where q.created_at >= now() - interval '7 days'),
    'last_30d', count(*),
    'ai_7d', count(*) filter (
      where q.created_at >= now() - interval '7 days' and q.status = 'answered' and q.answer_source = 'ai'
    ),
    'ai_30d', count(*) filter (where q.status = 'answered' and q.answer_source = 'ai'),
    'open_now', (select count(*) from public.ml_questions x where x.status in ('needs_review', 'failed'))
  )
  into v_questions
  from public.ml_questions q
  where q.created_at >= now() - interval '30 days';

  select jsonb_build_object(
    'cost_today_usd', coalesce(sum(e.cost_usd) filter (where e.created_at >= v_today), 0),
    'cost_7d_usd', coalesce(sum(e.cost_usd) filter (where e.created_at >= now() - interval '7 days'), 0),
    'cost_month_usd', coalesce(sum(e.cost_usd) filter (where e.created_at >= v_month), 0),
    'cost_prev_month_usd', coalesce(sum(e.cost_usd) filter (where e.created_at >= v_prev_month and e.created_at < v_month), 0),
    'tokens_month', coalesce(sum(e.total_tokens) filter (where e.created_at >= v_month), 0),
    'calls_month', count(*) filter (where e.created_at >= v_month),
    'errors_24h', count(*) filter (where e.created_at >= now() - interval '24 hours' and not e.success)
  )
  into v_ai
  from public.ai_usage_events e
  where e.created_at >= least(v_prev_month, now() - interval '30 days');

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'signups', coalesce(s.total, 0)) order by d.day), '[]'::jsonb)
  into v_signups_daily
  from generate_series(v_first_day::timestamp, (v_first_day + 29)::timestamp, interval '1 day') as d(day)
  left join (
    select (u.created_at at time zone 'America/Sao_Paulo')::date as day, count(*) as total
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.created_at >= v_first_day::timestamp at time zone 'America/Sao_Paulo'
      and u.deleted_at is null
      and not coalesce(p.is_platform_admin, false)
    group by 1
  ) s on s.day = d.day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day::date, 'cost_usd', coalesce(x.cost, 0), 'tokens', coalesce(x.tokens, 0), 'calls', coalesce(x.calls, 0)
  ) order by d.day), '[]'::jsonb)
  into v_ai_daily
  from generate_series(v_first_day::timestamp, (v_first_day + 29)::timestamp, interval '1 day') as d(day)
  left join (
    select (e.created_at at time zone 'America/Sao_Paulo')::date as day,
           sum(e.cost_usd) as cost, sum(e.total_tokens) as tokens, count(*) as calls
    from public.ai_usage_events e
    where e.created_at >= v_first_day::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ) x on x.day = d.day::date;

  select jsonb_build_object(
    'questions_stuck', (
      select count(*) from public.ml_questions q
      where (q.status = 'processing' and q.locked_until < now())
         or (q.status in ('pending', 'failed') and q.next_attempt_at < now() - interval '10 minutes')
    ),
    'questions_failed', (select count(*) from public.ml_questions q where q.status = 'failed'),
    'conversations_stuck', (
      select count(*) from public.ml_conversations c
      where (c.status = 'processing' and c.locked_until < now())
         or (c.status in ('pending', 'failed') and c.next_attempt_at < now() - interval '10 minutes')
    ),
    'conversations_failed', (select count(*) from public.ml_conversations c where c.status = 'failed'),
    'ml_invalid_tokens', (
      select count(*) from public.ml_accounts a where a.status <> 'disconnected' and a.token_status = 'invalid'
    ),
    'ai_errors_24h', (
      select count(*) from public.ai_usage_events e where e.created_at >= now() - interval '24 hours' and not e.success
    )
  )
  into v_alerts;

  select jsonb_build_object(
    'ai_paused', s.ai_paused,
    'ai_paused_at', s.ai_paused_at,
    'ai_paused_reason', s.ai_paused_reason,
    'usd_brl_rate', s.usd_brl_rate,
    'monthly_fixed_costs_brl', s.monthly_fixed_costs_brl
  )
  into v_platform
  from public.platform_settings s
  where s.id;

  return jsonb_build_object(
    'generated_at', now(),
    'organizations', v_orgs,
    'users', v_users,
    'ml_accounts', v_accounts,
    'questions', v_questions,
    'ai', v_ai,
    'signups_daily', v_signups_daily,
    'ai_daily', v_ai_daily,
    'alerts', v_alerts,
    'platform', coalesce(v_platform, '{}'::jsonb)
  );
end;
$$;

-- Lista de clientes com busca, filtros, ordem e página (até 5.000 linhas por vez, para a exportação CSV).
create or replace function public.admin_list_organizations(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_sort text default 'recent',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like text;
  v_compact text := upper(regexp_replace(coalesce(p_search, ''), '[^0-9A-Za-z]', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.admin_assert();
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with filtered as (
    select r.*
    from public.admin_org_rows() r
    where (nullif(p_status, '') is null or r.status = p_status)
      and (
        nullif(p_plan, '') is null
        or (p_plan = 'none' and r.plan is null)
        or r.plan = p_plan
      )
      and (
        v_search is null
        or r.name ilike v_like
        or r.owner_email ilike v_like
        or r.owner_name ilike v_like
        or r.ml_nicknames ilike v_like
        or r.legal_name ilike v_like
        or r.organization_id::text = lower(v_search)
        or (char_length(v_compact) >= 4 and r.document like '%' || v_compact || '%')
        or (char_length(v_digits) >= 4 and r.owner_whatsapp like '%' || v_digits || '%')
      )
  ),
  ordered as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'name' then lower(f.name) end asc,
        case when p_sort = 'last_seen' then f.last_seen_at end desc nulls last,
        case when p_sort = 'ai_cost' then f.ai_cost_30d_usd end desc nulls last,
        case when p_sort = 'questions' then f.questions_30d end desc nulls last,
        case when p_sort = 'trial_end' then f.trial_ends_at end asc,
        f.created_at desc
    ) as position
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) - 'position' order by p.position)
      from (select * from ordered order by position limit v_limit offset v_offset) p
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- Ficha completa de um cliente.
create or replace function public.admin_organization_detail(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first_day date := (now() at time zone 'America/Sao_Paulo')::date - 29;
  v_org jsonb;
begin
  perform public.admin_assert();

  select to_jsonb(r) into v_org from public.admin_org_rows() r where r.organization_id = p_organization_id;
  if v_org is null then
    return null;
  end if;

  return jsonb_build_object(
    'organization', v_org,
    'billing', (
      select jsonb_build_object(
        'document_type', b.document_type, 'document', b.document, 'legal_name', b.legal_name,
        'postal_code', b.postal_code, 'street', b.street, 'address_number', b.address_number,
        'complement', b.complement, 'district', b.district, 'city', b.city, 'state', b.state,
        'created_at', b.created_at, 'updated_at', b.updated_at
      )
      from public.billing_profiles b
      where b.organization_id = p_organization_id
    ),
    'notes', (
      select jsonb_build_object('notes', n.notes, 'updated_at', n.updated_at,
                                'updated_by_email', (select u.email::text from auth.users u where u.id = n.updated_by))
      from public.admin_organization_notes n
      where n.organization_id = p_organization_id
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'role', m.role,
        'email', u.email::text,
        'full_name', p.full_name,
        'whatsapp', p.whatsapp,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'last_seen_at', p.last_seen_at,
        'email_confirmed_at', u.email_confirmed_at,
        'banned_until', u.banned_until,
        'is_platform_admin', coalesce(p.is_platform_admin, false),
        'onboarding_completed_at', p.onboarding_completed_at,
        'terms_version', p.terms_version,
        'terms_accepted_at', p.terms_accepted_at,
        'mfa_factors', (
          select count(*) from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'
        )
      ) order by (m.role = 'owner') desc, m.created_at), '[]'::jsonb)
      from public.organization_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.organization_id = p_organization_id
    ),
    'ml_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'ml_user_id', a.ml_user_id,
        'nickname', a.nickname,
        'site_id', a.site_id,
        'status', a.status,
        'token_status', a.token_status,
        'last_refresh_error', left(a.last_refresh_error, 300),
        'last_refresh_error_at', a.last_refresh_error_at,
        'auto_reply_enabled', a.auto_reply_enabled,
        'answer_mode', a.answer_mode,
        'configured', a.store_profile_completed_at is not null,
        'after_sale_enabled', a.after_sale_enabled,
        'created_at', a.created_at,
        'questions_30d', (
          select count(*) from public.ml_questions q
          where q.ml_account_id = a.id and q.created_at >= now() - interval '30 days'
        ),
        'ai_answers_30d', (
          select count(*) from public.ml_questions q
          where q.ml_account_id = a.id and q.created_at >= now() - interval '30 days'
            and q.status = 'answered' and q.answer_source = 'ai'
        ),
        'open_now', (
          select count(*) from public.ml_questions q
          where q.ml_account_id = a.id and q.status in ('needs_review', 'failed')
        ),
        'last_question_at', (select max(q.created_at) from public.ml_questions q where q.ml_account_id = a.id)
      ) order by a.created_at), '[]'::jsonb)
      from public.ml_accounts a
      where a.organization_id = p_organization_id
    ),
    'questions_30d', (
      select jsonb_build_object(
        'total', count(*),
        'ai', count(*) filter (where q.status = 'answered' and q.answer_source = 'ai'),
        'fallback', count(*) filter (where q.status = 'answered' and q.answer_source = 'ai' and q.fallback_reason is not null),
        'manual', count(*) filter (where q.status = 'answered' and q.answer_source = 'manual'),
        'outside', count(*) filter (where q.status = 'answered_outside' or (q.status = 'answered' and q.answer_source = 'external')),
        'open', count(*) filter (where q.status in ('needs_review', 'failed')),
        'queue', count(*) filter (where q.status in ('pending', 'processing')),
        'ignored', count(*) filter (where q.status = 'ignored')
      )
      from public.ml_questions q
      where q.organization_id = p_organization_id and q.created_at >= now() - interval '30 days'
    ),
    'conversations_30d', (
      select jsonb_build_object(
        'total', count(*),
        'answered', count(*) filter (where c.status = 'answered'),
        'open', count(*) filter (where c.status in ('needs_review', 'failed'))
      )
      from public.ml_conversations c
      where c.organization_id = p_organization_id and c.created_at >= now() - interval '30 days'
    ),
    'usage_by_feature', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'feature', x.feature, 'calls', x.calls, 'tokens', x.tokens, 'cost_usd', x.cost, 'failed', x.failed
      ) order by x.cost desc), '[]'::jsonb)
      from (
        select e.feature, count(*) as calls, sum(e.total_tokens) as tokens, sum(e.cost_usd) as cost,
               count(*) filter (where not e.success) as failed
        from public.ai_usage_events e
        where e.organization_id = p_organization_id and e.created_at >= now() - interval '30 days'
        group by e.feature
      ) x
    ),
    'usage_daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date, 'cost_usd', coalesce(x.cost, 0), 'tokens', coalesce(x.tokens, 0), 'calls', coalesce(x.calls, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_first_day::timestamp, (v_first_day + 29)::timestamp, interval '1 day') as d(day)
      left join (
        select (e.created_at at time zone 'America/Sao_Paulo')::date as day,
               sum(e.cost_usd) as cost, sum(e.total_tokens) as tokens, count(*) as calls
        from public.ai_usage_events e
        where e.organization_id = p_organization_id
          and e.created_at >= v_first_day::timestamp at time zone 'America/Sao_Paulo'
        group by 1
      ) x on x.day = d.day::date
    ),
    'recent_questions', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select q.id, left(q.question_text, 200) as question_text, q.item_title, q.status, q.answer_source,
               q.review_reason, q.fallback_reason, q.ai_confidence, q.created_at,
               (select a.nickname from public.ml_accounts a where a.id = q.ml_account_id) as account_nickname
        from public.ml_questions q
        where q.organization_id = p_organization_id
        order by q.created_at desc
        limit 10
      ) r
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select l.id, l.created_at, l.actor_email, l.action, l.summary, l.details
        from public.admin_audit_log l
        where l.organization_id = p_organization_id
        order by l.created_at desc
        limit 20
      ) r
    )
  );
end;
$$;

-- Uso e custo da IA num período [p_from, p_to), com o período anterior de mesmo tamanho para comparação.
create or replace function public.admin_ai_usage(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := least(p_from, p_to);
  v_to timestamptz := greatest(p_from, p_to);
  v_prev_from timestamptz;
  v_first_day date;
  v_last_day date;
begin
  perform public.admin_assert();
  if v_to - v_from > interval '400 days' then
    raise exception 'PERIOD_TOO_LONG';
  end if;
  v_prev_from := v_from - (v_to - v_from);
  v_first_day := (v_from at time zone 'America/Sao_Paulo')::date;
  v_last_day := ((v_to - interval '1 second') at time zone 'America/Sao_Paulo')::date;

  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'calls', count(*),
        'failed', count(*) filter (where not e.success),
        'input_tokens', coalesce(sum(e.input_tokens), 0),
        'cached_input_tokens', coalesce(sum(e.cached_input_tokens), 0),
        'output_tokens', coalesce(sum(e.output_tokens), 0),
        'reasoning_tokens', coalesce(sum(e.reasoning_tokens), 0),
        'total_tokens', coalesce(sum(e.total_tokens), 0),
        'cost_usd', coalesce(sum(e.cost_usd), 0),
        'avg_latency_ms', round(avg(e.latency_ms) filter (where e.success))
      )
      from public.ai_usage_events e
      where e.created_at >= v_from and e.created_at < v_to
    ),
    'previous', (
      select jsonb_build_object(
        'calls', count(*),
        'total_tokens', coalesce(sum(e.total_tokens), 0),
        'cost_usd', coalesce(sum(e.cost_usd), 0)
      )
      from public.ai_usage_events e
      where e.created_at >= v_prev_from and e.created_at < v_from
    ),
    'answers', jsonb_build_object(
      'questions_ai', (
        select count(*) from public.ml_questions q
        where q.status = 'answered' and q.answer_source = 'ai' and q.answered_at >= v_from and q.answered_at < v_to
      ),
      'after_sale_ai', (
        select count(*) from public.ml_conversation_messages m
        where m.source = 'ai' and m.sent_at >= v_from and m.sent_at < v_to
      )
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date, 'cost_usd', coalesce(x.cost, 0), 'tokens', coalesce(x.tokens, 0),
        'calls', coalesce(x.calls, 0), 'failed', coalesce(x.failed, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_first_day::timestamp, v_last_day::timestamp, interval '1 day') as d(day)
      left join (
        select (e.created_at at time zone 'America/Sao_Paulo')::date as day, sum(e.cost_usd) as cost,
               sum(e.total_tokens) as tokens, count(*) as calls, count(*) filter (where not e.success) as failed
        from public.ai_usage_events e
        where e.created_at >= v_from and e.created_at < v_to
        group by 1
      ) x on x.day = d.day::date
    ),
    'by_feature', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'feature', x.feature, 'calls', x.calls, 'tokens', x.tokens, 'cost_usd', x.cost, 'failed', x.failed,
        'avg_tokens', x.avg_tokens
      ) order by x.cost desc), '[]'::jsonb)
      from (
        select e.feature, count(*) as calls, sum(e.total_tokens) as tokens, sum(e.cost_usd) as cost,
               count(*) filter (where not e.success) as failed,
               round(avg(e.total_tokens) filter (where e.success)) as avg_tokens
        from public.ai_usage_events e
        where e.created_at >= v_from and e.created_at < v_to
        group by e.feature
      ) x
    ),
    'by_model', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'model', x.model, 'calls', x.calls, 'input_tokens', x.input_tokens, 'cached_input_tokens', x.cached,
        'output_tokens', x.output_tokens, 'total_tokens', x.tokens, 'cost_usd', x.cost
      ) order by x.cost desc, x.tokens desc), '[]'::jsonb)
      from (
        select e.model, count(*) as calls, sum(e.input_tokens) as input_tokens, sum(e.cached_input_tokens) as cached,
               sum(e.output_tokens) as output_tokens, sum(e.total_tokens) as tokens, sum(e.cost_usd) as cost
        from public.ai_usage_events e
        where e.created_at >= v_from and e.created_at < v_to
        group by e.model
      ) x
    ),
    'top_organizations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', x.organization_id, 'name', o.name, 'calls', x.calls, 'tokens', x.tokens,
        'cost_usd', x.cost, 'monthly_price', o.monthly_price,
        'status', public.admin_org_status(o.plan, o.billing_exempt, o.subscription_status, o.trial_ends_at)
      ) order by x.cost desc), '[]'::jsonb)
      from (
        select e.organization_id, count(*) as calls, sum(e.total_tokens) as tokens, sum(e.cost_usd) as cost
        from public.ai_usage_events e
        where e.created_at >= v_from and e.created_at < v_to and e.organization_id is not null
        group by e.organization_id
        order by sum(e.cost_usd) desc
        limit 10
      ) x
      join public.organizations o on o.id = x.organization_id
    ),
    'recent_errors', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select e.created_at, e.feature, e.model, e.error, e.organization_id,
               (select o.name from public.organizations o where o.id = e.organization_id) as organization_name
        from public.ai_usage_events e
        where not e.success and e.created_at >= v_from and e.created_at < v_to
        order by e.created_at desc
        limit 10
      ) r
    ),
    'usd_brl_rate', (select s.usd_brl_rate from public.platform_settings s where s.id)
  );
end;
$$;

-- Financeiro do mês atual (fuso de Brasília): receita recorrente, custo de IA por cliente, inadimplentes e testes.
create or replace function public.admin_finance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_prev_month timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')
    at time zone 'America/Sao_Paulo';
  v_next_month timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')
    at time zone 'America/Sao_Paulo';
  v_result jsonb;
begin
  perform public.admin_assert();

  with o as materialized (select * from public.admin_org_rows()),
  answers as (
    select q.organization_id, count(*) as ai_answers
    from public.ml_questions q
    where q.status = 'answered' and q.answer_source = 'ai' and q.answered_at >= v_month
    group by q.organization_id
  )
  select jsonb_build_object(
    'month_start', v_month,
    'month_end', v_next_month,
    'settings', (
      select jsonb_build_object('usd_brl_rate', s.usd_brl_rate, 'monthly_fixed_costs_brl', s.monthly_fixed_costs_brl,
                                'updated_at', s.updated_at)
      from public.platform_settings s where s.id
    ),
    'mrr', (select coalesce(sum(c.monthly_price), 0) from o c where c.status = 'active'),
    'paying', (select count(*) from o c where c.status = 'active'),
    'paying_without_price', (select count(*) from o c where c.status = 'active' and c.monthly_price is null),
    'counts', (
      select coalesce(jsonb_object_agg(s.status, s.total), '{}'::jsonb)
      from (select c.status, count(*) as total from o c group by c.status) s
    ),
    'ai_cost_month_usd', (
      select coalesce(sum(e.cost_usd), 0) from public.ai_usage_events e where e.created_at >= v_month
    ),
    'ai_cost_prev_month_usd', (
      select coalesce(sum(e.cost_usd), 0) from public.ai_usage_events e
      where e.created_at >= v_prev_month and e.created_at < v_month
    ),
    'ai_cost_unassigned_month_usd', (
      select coalesce(sum(e.cost_usd), 0) from public.ai_usage_events e
      where e.created_at >= v_month and e.organization_id is null
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', c.organization_id, 'name', c.name, 'status', c.status, 'plan', c.plan,
        'monthly_price', c.monthly_price, 'ai_cost_month_usd', c.ai_cost_month_usd,
        'ai_answers_month', coalesce(a.ai_answers, 0), 'current_period_end', c.current_period_end
      ) order by c.ai_cost_month_usd desc, c.name), '[]'::jsonb)
      from o c
      left join answers a on a.organization_id = c.organization_id
      where c.status in ('active', 'past_due') or c.monthly_price is not null or c.ai_cost_month_usd > 0
    ),
    'past_due', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', c.organization_id, 'name', c.name, 'owner_email', c.owner_email,
        'owner_whatsapp', c.owner_whatsapp, 'monthly_price', c.monthly_price, 'current_period_end', c.current_period_end
      ) order by c.current_period_end nulls first), '[]'::jsonb)
      from o c
      where c.status = 'past_due'
    ),
    'trials_ending', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', c.organization_id, 'name', c.name, 'owner_email', c.owner_email,
        'owner_whatsapp', c.owner_whatsapp, 'trial_ends_at', c.trial_ends_at, 'stage', c.stage,
        'ai_answers_30d', c.ai_answers_30d
      ) order by c.trial_ends_at), '[]'::jsonb)
      from o c
      where c.status = 'trial' and c.trial_ends_at <= now() + interval '7 days'
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- Operação: filas, erros recentes, contas com problema e volume das últimas 24 horas.
create or replace function public.admin_operations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first_hour timestamptz := date_trunc('hour', now()) - interval '23 hours';
begin
  perform public.admin_assert();

  return jsonb_build_object(
    'platform', (
      select jsonb_build_object(
        'ai_paused', s.ai_paused, 'ai_paused_reason', s.ai_paused_reason, 'ai_paused_at', s.ai_paused_at,
        'ai_paused_by_email', (select u.email::text from auth.users u where u.id = s.ai_paused_by)
      )
      from public.platform_settings s where s.id
    ),
    'questions', (
      select jsonb_build_object(
        'pending', count(*) filter (where q.status = 'pending'),
        'processing', count(*) filter (where q.status = 'processing'),
        'failed', count(*) filter (where q.status = 'failed'),
        'needs_review', count(*) filter (where q.status = 'needs_review'),
        'stuck', count(*) filter (where
          (q.status = 'processing' and q.locked_until < now())
          or (q.status in ('pending', 'failed') and q.next_attempt_at < now() - interval '10 minutes')),
        'oldest_waiting_at', min(q.created_at) filter (where q.status in ('pending', 'processing', 'failed'))
      )
      from public.ml_questions q
      where q.status in ('pending', 'processing', 'failed', 'needs_review')
    ),
    'conversations', (
      select jsonb_build_object(
        'pending', count(*) filter (where c.status = 'pending'),
        'processing', count(*) filter (where c.status = 'processing'),
        'failed', count(*) filter (where c.status = 'failed'),
        'needs_review', count(*) filter (where c.status = 'needs_review'),
        'stuck', count(*) filter (where
          (c.status = 'processing' and c.locked_until < now())
          or (c.status in ('pending', 'failed') and c.next_attempt_at < now() - interval '10 minutes')),
        'oldest_waiting_at', min(c.created_at) filter (where c.status in ('pending', 'processing', 'failed'))
      )
      from public.ml_conversations c
      where c.status in ('pending', 'processing', 'failed', 'needs_review')
    ),
    'recent_errors', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc), '[]'::jsonb)
      from (
        select * from (
          (
            select 'question' as kind, q.id, q.organization_id, o.name as organization_name,
                   a.nickname as account_nickname, q.status, q.attempts, left(q.last_error, 300) as error, q.updated_at
            from public.ml_questions q
            join public.organizations o on o.id = q.organization_id
            left join public.ml_accounts a on a.id = q.ml_account_id
            where q.last_error is not null and q.updated_at >= now() - interval '48 hours'
            order by q.updated_at desc
            limit 20
          )
          union all
          (
            select 'conversation', c.id, c.organization_id, o.name, a.nickname, c.status, c.attempts,
                   left(c.last_error, 300), c.updated_at
            from public.ml_conversations c
            join public.organizations o on o.id = c.organization_id
            left join public.ml_accounts a on a.id = c.ml_account_id
            where c.last_error is not null and c.updated_at >= now() - interval '48 hours'
            order by c.updated_at desc
            limit 20
          )
        ) u
        order by u.updated_at desc
        limit 20
      ) r
    ),
    'accounts_with_problems', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'organization_id', a.organization_id, 'organization_name', o.name, 'nickname', a.nickname,
        'status', a.status, 'token_status', a.token_status, 'error', left(a.last_refresh_error, 300),
        'error_at', a.last_refresh_error_at
      ) order by a.last_refresh_error_at desc nulls last), '[]'::jsonb)
      from public.ml_accounts a
      join public.organizations o on o.id = a.organization_id
      where a.status <> 'disconnected'
        and (a.token_status = 'invalid' or a.last_refresh_error_at >= now() - interval '24 hours')
    ),
    'hourly', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'questions', coalesce(q.total, 0), 'ai_calls', coalesce(e.total, 0),
        'ai_failed', coalesce(e.failed, 0)
      ) order by h.hour), '[]'::jsonb)
      from generate_series(v_first_hour, date_trunc('hour', now()), interval '1 hour') as h(hour)
      left join (
        select date_trunc('hour', x.created_at) as hour, count(*) as total
        from public.ml_questions x
        where x.created_at >= v_first_hour
        group by 1
      ) q on q.hour = h.hour
      left join (
        select date_trunc('hour', x.created_at) as hour, count(*) as total,
               count(*) filter (where not x.success) as failed
        from public.ai_usage_events x
        where x.created_at >= v_first_hour
        group by 1
      ) e on e.hour = h.hour
    ),
    'ai_24h', (
      select jsonb_build_object(
        'calls', count(*),
        'failed', count(*) filter (where not e.success),
        'avg_latency_ms', round(avg(e.latency_ms) filter (where e.success)),
        'last_error', (
          select jsonb_build_object('created_at', x.created_at, 'error', x.error, 'feature', x.feature)
          from public.ai_usage_events x
          where not x.success
          order by x.created_at desc
          limit 1
        )
      )
      from public.ai_usage_events e
      where e.created_at >= now() - interval '24 hours'
    )
  );
end;
$$;

-- Histórico do painel (auditoria), com filtros.
create or replace function public.admin_list_audit(
  p_organization_id uuid default null,
  p_action_prefix text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := nullif(regexp_replace(coalesce(p_action_prefix, ''), '[^a-z_.]', '', 'g'), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.admin_assert();

  with filtered as (
    select l.*
    from public.admin_audit_log l
    where (p_organization_id is null or l.organization_id = p_organization_id)
      and (v_prefix is null or left(l.action, char_length(v_prefix)) = v_prefix)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'created_at', f.created_at, 'actor_email', f.actor_email, 'action', f.action,
        'target_type', f.target_type, 'target_id', f.target_id, 'organization_id', f.organization_id,
        'organization_name', (select o.name from public.organizations o where o.id = f.organization_id),
        'summary', f.summary, 'details', f.details, 'ip', f.ip, 'user_agent', f.user_agent
      ) order by f.created_at desc, f.id desc)
      from (select * from filtered order by created_at desc, id desc limit v_limit offset v_offset) f
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------- alterações (auditadas)

-- Assinatura e dados da loja. Só os campos listados; o histórico guarda antes/depois do que mudou.
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
    'billing_exempt', 'ml_accounts_limit', 'monthly_price'
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
           then (p_changes ->> 'monthly_price')::numeric else o.monthly_price end
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

-- Notas internas do cliente.
create or replace function public.admin_set_organization_notes(
  p_organization_id uuid,
  p_notes text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text;
begin
  perform public.admin_assert();
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  select n.notes into v_before from public.admin_organization_notes n where n.organization_id = p_organization_id;

  insert into public.admin_organization_notes (organization_id, notes, updated_at, updated_by)
  values (p_organization_id, coalesce(p_notes, ''), now(), auth.uid())
  on conflict (organization_id) do update
    set notes = excluded.notes, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  if coalesce(v_before, '') is distinct from coalesce(p_notes, '') then
    perform public.admin_write_audit(
      'organization.notes', 'organization', p_organization_id::text, p_organization_id,
      'Notas internas atualizadas',
      jsonb_build_object('before', left(coalesce(v_before, ''), 2000), 'after', left(coalesce(p_notes, ''), 2000)),
      p_context
    );
  end if;
end;
$$;

-- Nome e WhatsApp de um usuário (e-mail, senha e bloqueio são feitos pelo servidor na API do Supabase Auth).
create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_changes jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_diff_before jsonb := '{}'::jsonb;
  v_diff_after jsonb := '{}'::jsonb;
  v_org uuid;
begin
  perform public.admin_assert();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'INVALID_CHANGES';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('full_name', 'whatsapp') then
      raise exception 'INVALID_FIELD %', v_key;
    end if;
  end loop;

  select jsonb_build_object('full_name', p.full_name, 'whatsapp', p.whatsapp)
    into v_before from public.profiles p where p.id = p_user_id for update;
  if v_before is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  update public.profiles p
     set full_name = case when p_changes ? 'full_name' then trim(coalesce(p_changes ->> 'full_name', '')) else p.full_name end,
         whatsapp = case when p_changes ? 'whatsapp' then nullif(p_changes ->> 'whatsapp', '') else p.whatsapp end
   where p.id = p_user_id
  returning jsonb_build_object('full_name', p.full_name, 'whatsapp', p.whatsapp) into v_after;

  foreach v_key in array array['full_name', 'whatsapp'] loop
    if (v_before -> v_key) is distinct from (v_after -> v_key) then
      v_diff_before := v_diff_before || jsonb_build_object(v_key, v_before -> v_key);
      v_diff_after := v_diff_after || jsonb_build_object(v_key, v_after -> v_key);
    end if;
  end loop;

  if v_diff_after <> '{}'::jsonb then
    select m.organization_id into v_org
    from public.organization_members m where m.user_id = p_user_id order by m.created_at limit 1;
    perform public.admin_write_audit(
      'user.update', 'user', p_user_id::text, v_org, 'Dados do usuário alterados',
      jsonb_build_object('before', v_diff_before, 'after', v_diff_after), p_context
    );
  end if;

  return v_diff_after;
end;
$$;

-- Pausa a IA de uma conta ML (perguntas, pós-venda ou as duas). Religar continua sendo decisão do cliente.
create or replace function public.admin_pause_ml_account(
  p_ml_account_id uuid,
  p_scope text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.ml_accounts;
  v_label text;
begin
  perform public.admin_assert();
  if p_scope is null or p_scope not in ('answers', 'after_sale', 'all') then
    raise exception 'INVALID_SCOPE';
  end if;

  update public.ml_accounts a
     set auto_reply_enabled = case when p_scope in ('answers', 'all') then false else a.auto_reply_enabled end,
         after_sale_enabled = case when p_scope in ('after_sale', 'all') then false else a.after_sale_enabled end
   where a.id = p_ml_account_id
  returning * into v_account;
  if v_account.id is null then
    raise exception 'ML_ACCOUNT_NOT_FOUND';
  end if;

  v_label := coalesce(v_account.nickname, v_account.ml_user_id::text);
  perform public.admin_write_audit(
    'ml_account.pause', 'ml_account', p_ml_account_id::text, v_account.organization_id,
    case p_scope
      when 'answers' then 'Respostas automáticas pausadas na conta ' || v_label
      when 'after_sale' then 'Pós-venda pausado na conta ' || v_label
      else 'IA pausada na conta ' || v_label
    end,
    jsonb_build_object('scope', p_scope),
    p_context
  );
end;
$$;

-- Configurações da plataforma: pausa geral da IA, cotação do dólar e custos fixos.
create or replace function public.admin_update_platform_settings(
  p_changes jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_fields constant text[] := array['ai_paused', 'ai_paused_reason', 'usd_brl_rate', 'monthly_fixed_costs_brl'];
  v_before jsonb;
  v_after jsonb;
  v_diff_before jsonb := '{}'::jsonb;
  v_diff_after jsonb := '{}'::jsonb;
  v_action text := 'platform.settings';
  v_summary text := 'Configurações da plataforma alteradas';
begin
  perform public.admin_assert();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'INVALID_CHANGES';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_fields) then
      raise exception 'INVALID_FIELD %', v_key;
    end if;
  end loop;

  select to_jsonb(s) into v_before from public.platform_settings s where s.id for update;

  update public.platform_settings s
     set ai_paused = case when p_changes ? 'ai_paused' then (p_changes ->> 'ai_paused')::boolean else s.ai_paused end,
         ai_paused_reason = case when p_changes ? 'ai_paused_reason'
           then left(trim(coalesce(p_changes ->> 'ai_paused_reason', '')), 300) else s.ai_paused_reason end,
         usd_brl_rate = case when p_changes ? 'usd_brl_rate'
           then (p_changes ->> 'usd_brl_rate')::numeric else s.usd_brl_rate end,
         monthly_fixed_costs_brl = case when p_changes ? 'monthly_fixed_costs_brl'
           then (p_changes ->> 'monthly_fixed_costs_brl')::numeric else s.monthly_fixed_costs_brl end,
         ai_paused_at = case
           when p_changes ? 'ai_paused' and (p_changes ->> 'ai_paused')::boolean and not s.ai_paused then now()
           when p_changes ? 'ai_paused' and not (p_changes ->> 'ai_paused')::boolean then null
           else s.ai_paused_at end,
         ai_paused_by = case
           when p_changes ? 'ai_paused' and (p_changes ->> 'ai_paused')::boolean and not s.ai_paused then auth.uid()
           when p_changes ? 'ai_paused' and not (p_changes ->> 'ai_paused')::boolean then null
           else s.ai_paused_by end,
         updated_by = auth.uid()
   where s.id
  returning to_jsonb(s) into v_after;

  foreach v_key in array v_fields loop
    if (v_before -> v_key) is distinct from (v_after -> v_key) then
      v_diff_before := v_diff_before || jsonb_build_object(v_key, v_before -> v_key);
      v_diff_after := v_diff_after || jsonb_build_object(v_key, v_after -> v_key);
    end if;
  end loop;

  if (v_before -> 'ai_paused') is distinct from (v_after -> 'ai_paused') then
    v_action := case when (v_after ->> 'ai_paused')::boolean then 'platform.ai_paused' else 'platform.ai_resumed' end;
    v_summary := case when (v_after ->> 'ai_paused')::boolean
      then 'IA de toda a plataforma PAUSADA' else 'IA de toda a plataforma retomada' end;
  end if;

  if v_diff_after <> '{}'::jsonb then
    perform public.admin_write_audit(
      v_action, 'platform', 'settings', null, v_summary,
      jsonb_build_object('before', v_diff_before, 'after', v_diff_after), p_context
    );
  end if;

  return v_diff_after;
end;
$$;

-- Registra no histórico uma ação feita pelo servidor fora do banco (Supabase Auth: e-mail, senha, bloqueio...).
create or replace function public.admin_log_event(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_organization_id uuid,
  p_summary text,
  p_details jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  perform public.admin_write_audit(p_action, p_target_type, p_target_id, p_organization_id, p_summary, p_details, p_context);
end;
$$;

-- ---------------------------------------------------------------------------------------------- privilégios das funções

-- Internas: ninguém de fora chama (as funções admin_* rodam como dono e conseguem usá-las).
revoke execute on function public.admin_audit_log_append_only() from public, anon, authenticated;
revoke execute on function public.admin_write_audit(text, text, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_org_status(text, boolean, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_org_stage(boolean, boolean, boolean, integer, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.admin_org_rows() from public, anon, authenticated;

-- API do painel: só usuários logados, e cada função confere a sessão de administrador com admin_assert().
revoke execute on function public.admin_assert() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_list_organizations(text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_organization_detail(uuid) from public, anon;
revoke execute on function public.admin_ai_usage(timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_finance() from public, anon;
revoke execute on function public.admin_operations() from public, anon;
revoke execute on function public.admin_list_audit(uuid, text, integer, integer) from public, anon;
revoke execute on function public.admin_update_organization(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.admin_set_organization_notes(uuid, text, jsonb) from public, anon;
revoke execute on function public.admin_update_profile(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.admin_pause_ml_account(uuid, text, jsonb) from public, anon;
revoke execute on function public.admin_update_platform_settings(jsonb, jsonb) from public, anon;
revoke execute on function public.admin_log_event(text, text, text, uuid, text, jsonb, jsonb) from public, anon;

grant execute on function public.admin_assert() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_organizations(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_organization_detail(uuid) to authenticated;
grant execute on function public.admin_ai_usage(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_finance() to authenticated;
grant execute on function public.admin_operations() to authenticated;
grant execute on function public.admin_list_audit(uuid, text, integer, integer) to authenticated;
grant execute on function public.admin_update_organization(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_organization_notes(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_update_profile(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_pause_ml_account(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_update_platform_settings(jsonb, jsonb) to authenticated;
grant execute on function public.admin_log_event(text, text, text, uuid, text, jsonb, jsonb) to authenticated;
