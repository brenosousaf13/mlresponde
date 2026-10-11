-- Resultados (analytics do vendedor): números do período em uma única consulta + premissas do cálculo de economia.
-- Aditiva e retrocompatível: só adiciona colunas com default e uma função nova.

alter table public.organizations
  add column if not exists analytics_minutes_per_answer numeric(4, 1) not null default 3
    check (analytics_minutes_per_answer between 0.5 and 60),
  add column if not exists analytics_hourly_cost numeric(8, 2) not null default 20
    check (analytics_hourly_cost between 1 and 10000);

comment on column public.organizations.analytics_minutes_per_answer is
  'Minutos que uma pessoa levaria para responder uma pergunta (premissa da economia em Resultados).';
comment on column public.organizations.analytics_hourly_cost is
  'Custo da hora de atendimento em R$ (premissa da economia em Resultados).';

-- Tudo o que a tela Resultados mostra, para o período [p_from, p_to) e o período anterior de mesmo tamanho.
-- Momento da pergunta = question_created_at (quando o comprador perguntou), com created_at como reserva.
-- Tempo de resposta só conta perguntas que chegaram na hora (até 15 min de atraso), para não punir a IA
-- pelas perguntas antigas importadas ao conectar a conta.
-- security invoker: roda com as permissões de quem chama (o RLS garante só a própria organização).
create or replace function public.analytics_overview(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_ml_account_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with raw as (
    select
      q.status,
      q.answer_source,
      q.answered_at,
      q.created_at,
      q.item_id,
      q.item_title,
      q.item_permalink,
      q.item_thumbnail,
      q.ai_model,
      q.ai_draft,
      coalesce(q.question_created_at, q.created_at) as asked_at
    from public.ml_questions q
    where q.organization_id = p_organization_id
      and (p_ml_account_id is null or q.ml_account_id = p_ml_account_id)
      -- created_at nunca é anterior ao momento da pergunta: filtro largo que usa o índice (organization_id, created_at).
      and q.created_at >= p_from - (p_to - p_from) - interval '1 hour'
  ),
  base as (
    select
      r.asked_at >= p_from as is_current,
      r.asked_at at time zone 'America/Sao_Paulo' as local_at,
      case
        when r.status = 'answered' and r.answer_source = 'ai' then 'ai'
        when r.status = 'answered' and r.answer_source = 'manual' then 'manual'
        when r.status in ('answered', 'answered_outside') then 'external'
        when r.status in ('needs_review', 'failed') then 'open'
        when r.status in ('pending', 'processing') then 'queue'
        else 'ignored'
      end as outcome,
      case
        when r.status in ('answered', 'answered_outside')
         and r.answered_at is not null
         and r.answered_at >= r.asked_at
         and r.created_at - r.asked_at <= interval '15 minutes'
        then extract(epoch from (r.answered_at - r.asked_at))::double precision
      end as response_seconds,
      r.created_at,
      r.item_id,
      r.item_title,
      r.item_permalink,
      r.item_thumbnail,
      r.ai_model,
      r.ai_draft
    from raw r
    where r.asked_at >= p_from - (p_to - p_from)
      and r.asked_at < p_to
  ),
  totals as (
    select
      b.is_current,
      count(*) as total,
      count(*) filter (where b.outcome = 'ai') as ai,
      count(*) filter (where b.outcome = 'manual') as manual,
      count(*) filter (where b.outcome = 'external') as external,
      count(*) filter (where b.outcome = 'open') as open,
      count(*) filter (where b.outcome = 'queue') as queue,
      count(*) filter (where b.outcome = 'ignored') as ignored,
      count(b.response_seconds) filter (where b.outcome = 'ai') as ai_timed,
      count(b.response_seconds) filter (where b.outcome in ('manual', 'external')) as human_timed,
      percentile_cont(0.5) within group (order by b.response_seconds)
        filter (where b.outcome = 'ai') as ai_median_seconds,
      percentile_cont(0.9) within group (order by b.response_seconds)
        filter (where b.outcome = 'ai') as ai_p90_seconds,
      percentile_cont(0.5) within group (order by b.response_seconds)
        filter (where b.outcome in ('manual', 'external')) as human_median_seconds
    from base b
    group by b.is_current
  ),
  cur as (
    select * from base where is_current
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day, 'total', d.total, 'ai', d.ai, 'human', d.human, 'open', d.open
    ) order by d.day), '[]'::jsonb) as data
    from (
      select
        c.local_at::date as day,
        count(*) as total,
        count(*) filter (where c.outcome = 'ai') as ai,
        count(*) filter (where c.outcome in ('manual', 'external')) as human,
        count(*) filter (where c.outcome in ('open', 'queue')) as open
      from cur c
      group by 1
    ) d
  ),
  speed as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', s.bucket, 'ai', s.ai, 'human', s.human
    ) order by s.bucket), '[]'::jsonb) as data
    from (
      select
        case
          when c.response_seconds < 60 then 0
          when c.response_seconds < 300 then 1
          when c.response_seconds < 3600 then 2
          when c.response_seconds < 86400 then 3
          else 4
        end as bucket,
        count(*) filter (where c.outcome = 'ai') as ai,
        count(*) filter (where c.outcome in ('manual', 'external')) as human
      from cur c
      where c.response_seconds is not null
      group by 1
    ) s
  ),
  hours as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'dow', h.dow, 'hour', h.hour, 'total', h.total, 'ai', h.ai
    ) order by h.dow, h.hour), '[]'::jsonb) as data
    from (
      select
        extract(isodow from c.local_at)::int as dow,
        extract(hour from c.local_at)::int as hour,
        count(*) as total,
        count(*) filter (where c.outcome = 'ai') as ai
      from cur c
      group by 1, 2
    ) h
  ),
  items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', i.item_id, 'title', i.title, 'permalink', i.permalink, 'thumbnail', i.thumbnail,
      'total', i.total, 'ai', i.ai, 'human', i.human, 'open', i.open
    ) order by i.total desc, i.item_id), '[]'::jsonb) as data
    from (
      select
        c.item_id,
        (array_agg(c.item_title order by c.created_at desc) filter (where c.item_title is not null))[1] as title,
        (array_agg(c.item_permalink order by c.created_at desc) filter (where c.item_permalink is not null))[1] as permalink,
        (array_agg(c.item_thumbnail order by c.created_at desc) filter (where c.item_thumbnail is not null))[1] as thumbnail,
        count(*) as total,
        count(*) filter (where c.outcome = 'ai') as ai,
        count(*) filter (where c.outcome in ('manual', 'external')) as human,
        count(*) filter (where c.outcome in ('open', 'queue')) as open
      from cur c
      where c.item_id is not null
      group by c.item_id
      order by count(*) desc, c.item_id
      limit 8
    ) i
  ),
  causes as (
    -- Por que a pergunta não foi respondida pela IA (inferido do que ficou gravado da análise da IA).
    select jsonb_build_object(
      'ai_off', count(*) filter (where c.ai_model is null),
      'no_info', count(*) filter (where c.ai_model is not null and coalesce(c.ai_draft, '') = ''),
      'unsure', count(*) filter (where c.ai_model is not null and coalesce(c.ai_draft, '') <> '')
    ) as data
    from cur c
    where c.outcome in ('manual', 'external', 'open')
  )
  select jsonb_build_object(
    'current', coalesce((select to_jsonb(t) - 'is_current' from totals t where t.is_current), '{}'::jsonb),
    'previous', coalesce((select to_jsonb(t) - 'is_current' from totals t where not t.is_current), '{}'::jsonb),
    'daily', (select data from daily),
    'speed', (select data from speed),
    'hours', (select data from hours),
    'items', (select data from items),
    'causes', (select data from causes),
    'lifetime_ai', (
      select count(*)
      from public.ml_questions q
      where q.organization_id = p_organization_id
        and (p_ml_account_id is null or q.ml_account_id = p_ml_account_id)
        and q.status = 'answered'
        and q.answer_source = 'ai'
    )
  );
$$;

revoke execute on function public.analytics_overview(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.analytics_overview(uuid, timestamptz, timestamptz, uuid) to authenticated;