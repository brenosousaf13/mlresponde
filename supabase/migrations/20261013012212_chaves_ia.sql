-- Chaves de IA (OpenAI) cadastradas e trocadas pelo painel do administrador, sem novo deploy.
-- Spec: docs/superpowers/specs/2026-10-12-chaves-ia-design.md
-- Aditiva: 1 tabela nova, 2 colunas nulas em ai_usage_events, a lista de funções de ai_usage_events.feature AMPLIADA com
-- 'key_check' (o CHECK é recriado com os mesmos valores + 1; nenhum dado muda) e funções novas.
--
-- Segurança:
--  * A chave chega aqui JÁ CRIPTOGRAFADA pelo servidor (AES-256-GCM com a chave-mestra AI_KEYS_ENCRYPTION_KEY, que só
--    existe na Vercel, e o id da linha como dado associado). O banco nunca vê a chave aberta: vazar só o banco não expõe
--    nenhuma chave, e trocar o conteúdo de uma linha por outro não funciona (o id faz parte da criptografia).
--  * Ninguém de fora lê a tabela: RLS ligado, nenhuma policy e nenhum privilégio para anon/authenticated. O servidor
--    (service role) só tem SELECT, para ler a chave em uso; toda escrita passa pelas funções abaixo.
--  * O painel usa as funções admin_* (admin_assert: admin da plataforma + 2 etapas recente) e NUNCA recebe o conteúdo
--    criptografado: só nome, final da chave (sk-…a1b2), situação e uso.
--  * Toda mudança grava o histórico (admin_audit_log) na mesma transação.

-- ---------------------------------------------------------------------------------------------- tabela

create table public.ai_provider_keys (
  -- Gerado pelo servidor antes de criptografar (faz parte do dado associado da criptografia).
  id uuid primary key,
  provider text not null default 'openai' check (provider in ('openai')),
  label text not null check (char_length(label) between 1 and 80),
  key_ciphertext text not null check (char_length(key_ciphertext) between 20 and 4000),
  -- Só para reconhecer a chave na tela: prefixo + 4 últimos caracteres (ex.: sk-proj-…a1b2).
  key_hint text not null check (char_length(key_hint) between 4 and 40),
  -- HMAC-SHA256 da chave com a chave-mestra: detecta cadastro repetido sem guardar a chave.
  key_fingerprint text not null check (key_fingerprint ~ '^[0-9a-f]{64}$'),
  -- active = em uso (no máximo 1 por provedor) · standby = reserva (entra sozinha se a OpenAI recusar a ativa) · disabled
  status text not null default 'standby' check (status in ('active', 'standby', 'disabled')),
  disabled_reason text check (char_length(disabled_reason) <= 300),
  disabled_at timestamptz,
  activated_at timestamptz,
  last_checked_at timestamptz,
  last_check_ok boolean,
  last_check_error text check (char_length(last_check_error) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.ai_provider_keys is
  'Chaves de IA cadastradas no painel do administrador, criptografadas pelo servidor (AI_KEYS_ENCRYPTION_KEY). Sem acesso fora do servidor.';

create unique index ai_provider_keys_one_active_idx on public.ai_provider_keys (provider) where status = 'active';
create unique index ai_provider_keys_fingerprint_idx on public.ai_provider_keys (provider, key_fingerprint);
create index ai_provider_keys_standby_idx on public.ai_provider_keys (provider, created_at desc) where status = 'standby';

create trigger ai_provider_keys_set_updated_at before update on public.ai_provider_keys
  for each row execute function public.set_updated_at();

alter table public.ai_provider_keys enable row level security;
-- Nenhuma policy: o navegador (anon/authenticated) não lê nem escreve.
revoke all on table public.ai_provider_keys from anon, authenticated, service_role;
grant select on table public.ai_provider_keys to service_role;

-- ---------------------------------------------------------------------------------------------- uso por chave

alter table public.ai_usage_events
  add column if not exists ai_key_id uuid references public.ai_provider_keys (id) on delete set null,
  add column if not exists key_source text check (key_source in ('panel', 'env'));

comment on column public.ai_usage_events.ai_key_id is 'Chave do painel usada na chamada (nula = variável de ambiente ou antes da Sessão 17).';
comment on column public.ai_usage_events.key_source is 'panel = chave cadastrada no painel; env = variável OPENAI_API_KEY; nula = antes da Sessão 17.';

create index if not exists ai_usage_events_key_idx on public.ai_usage_events (ai_key_id, created_at) where ai_key_id is not null;

-- Nova função registrada: o teste de chave feito pelo painel (custa uma fração de centavo).
alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check check (feature in (
  'question_answer', 'question_suggestion', 'assistant_test',
  'after_sale_answer', 'after_sale_suggestion', 'after_sale_test',
  'key_check'
));

-- ---------------------------------------------------------------------------------------------- funções internas

-- Próxima reserva vira a chave em uso (a mais nova primeiro). Devolve a linha promovida (ou nada).
create or replace function public.ai_keys_promote_standby(p_provider text, p_except uuid)
returns table (id uuid, label text, key_hint text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  update public.ai_provider_keys k
     set status = 'active', activated_at = now(), disabled_reason = null, disabled_at = null
   where k.id = (
     select s.id from public.ai_provider_keys s
      where s.provider = p_provider and s.status = 'standby' and s.id is distinct from p_except
      order by s.created_at desc
      limit 1
   )
  returning k.id, k.label, k.key_hint;
end;
$$;

-- ---------------------------------------------------------------------------------------------- painel (leitura)

-- Chaves cadastradas (sem o conteúdo criptografado) + uso de 30 dias por chave e da variável de ambiente.
create or replace function public.admin_list_ai_keys()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();

  return jsonb_build_object(
    'keys', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'provider', k.provider, 'label', k.label, 'hint', k.key_hint, 'status', k.status,
        'disabled_reason', k.disabled_reason, 'disabled_at', k.disabled_at, 'activated_at', k.activated_at,
        'last_checked_at', k.last_checked_at, 'last_check_ok', k.last_check_ok, 'last_check_error', k.last_check_error,
        'created_at', k.created_at,
        'created_by_email', (select u.email::text from auth.users u where u.id = k.created_by),
        'calls_30d', coalesce(x.calls, 0), 'failed_30d', coalesce(x.failed, 0), 'cost_30d_usd', coalesce(x.cost, 0),
        'last_used_at', (select max(e.created_at) from public.ai_usage_events e where e.ai_key_id = k.id)
      ) order by case k.status when 'active' then 0 when 'standby' then 1 else 2 end, k.created_at desc), '[]'::jsonb)
      from public.ai_provider_keys k
      left join lateral (
        select count(*) as calls, count(*) filter (where not e.success) as failed, sum(e.cost_usd) as cost
        from public.ai_usage_events e
        where e.ai_key_id = k.id and e.created_at >= now() - interval '30 days'
      ) x on true
    ),
    'env', (
      select jsonb_build_object(
        'calls_30d', count(*),
        'failed_30d', count(*) filter (where not e.success),
        'cost_30d_usd', coalesce(sum(e.cost_usd), 0),
        'last_used_at', max(e.created_at)
      )
      from public.ai_usage_events e
      where e.key_source = 'env' and e.created_at >= now() - interval '30 days'
    ),
    'recent_events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'created_at', a.created_at, 'action', a.action, 'summary', a.summary, 'actor_email', a.actor_email
      ) order by a.created_at desc), '[]'::jsonb)
      from (
        select l.created_at, l.action, l.summary, l.actor_email
        from public.admin_audit_log l
        where l.action like 'ai\_key.%'
        order by l.created_at desc
        limit 8
      ) a
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------- painel (escrita)

-- Cadastra uma chave já testada e criptografada pelo servidor. Entra em uso se pedido ou se não houver outra em uso.
create or replace function public.admin_add_ai_key(
  p_id uuid,
  p_label text,
  p_ciphertext text,
  p_hint text,
  p_fingerprint text,
  p_activate boolean default false,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := trim(coalesce(p_label, ''));
  v_status text;
  v_prev_id uuid;
  v_prev_label text;
  v_prev_hint text;
begin
  perform public.admin_assert();
  perform pg_advisory_xact_lock(hashtext('ai_provider_keys:openai'));

  if exists (
    select 1 from public.ai_provider_keys k where k.provider = 'openai' and k.key_fingerprint = p_fingerprint
  ) then
    raise exception 'AI_KEY_DUPLICATE';
  end if;

  v_status := case
    when coalesce(p_activate, false)
      or not exists (select 1 from public.ai_provider_keys k where k.provider = 'openai' and k.status = 'active')
    then 'active' else 'standby' end;

  if v_status = 'active' then
    update public.ai_provider_keys k set status = 'standby'
     where k.provider = 'openai' and k.status = 'active'
    returning k.id, k.label, k.key_hint into v_prev_id, v_prev_label, v_prev_hint;
  end if;

  insert into public.ai_provider_keys (
    id, provider, label, key_ciphertext, key_hint, key_fingerprint, status, activated_at,
    last_checked_at, last_check_ok, created_by
  )
  values (
    p_id, 'openai', v_label, p_ciphertext, p_hint, p_fingerprint, v_status,
    case when v_status = 'active' then now() end, now(), true, auth.uid()
  );

  perform public.admin_write_audit(
    'ai_key.add', 'ai_key', p_id::text, null,
    format('Chave de IA "%s" (%s) cadastrada %s', v_label, p_hint,
      case when v_status = 'active' then 'e em uso' else 'como reserva' end),
    jsonb_build_object(
      'after', jsonb_build_object('label', v_label, 'hint', p_hint, 'status', v_status),
      'previous_active', case when v_prev_id is null then null
        else jsonb_build_object('id', v_prev_id, 'label', v_prev_label, 'hint', v_prev_hint) end
    ),
    p_context
  );

  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- Muda a situação de uma chave. Ao tirar a chave em uso, a reserva mais nova entra no lugar (se houver).
-- Pôr em uso ou na reserva só depois de o servidor testar a chave (o painel faz o teste antes de chamar).
create or replace function public.admin_set_ai_key_status(
  p_key_id uuid,
  p_status text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.ai_provider_keys;
  v_prev_id uuid;
  v_prev_label text;
  v_prev_hint text;
  v_prom_id uuid;
  v_prom_label text;
  v_prom_hint text;
  v_action text;
  v_summary text;
begin
  perform public.admin_assert();
  if p_status is null or p_status not in ('active', 'standby', 'disabled') then
    raise exception 'INVALID_STATUS';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_provider_keys:openai'));

  select * into v_key from public.ai_provider_keys k where k.id = p_key_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_key.status = p_status then
    return jsonb_build_object('status', p_status, 'changed', false);
  end if;

  if p_status = 'active' then
    update public.ai_provider_keys k set status = 'standby'
     where k.provider = v_key.provider and k.status = 'active'
    returning k.id, k.label, k.key_hint into v_prev_id, v_prev_label, v_prev_hint;
    update public.ai_provider_keys k
       set status = 'active', activated_at = now(), disabled_reason = null, disabled_at = null,
           last_checked_at = now(), last_check_ok = true, last_check_error = null
     where k.id = p_key_id;
    v_action := 'ai_key.activate';
    v_summary := format('Chave de IA "%s" (%s) posta em uso', v_key.label, v_key.key_hint);
  elsif p_status = 'standby' then
    update public.ai_provider_keys k
       set status = 'standby', disabled_reason = null, disabled_at = null,
           last_checked_at = now(), last_check_ok = true, last_check_error = null
     where k.id = p_key_id;
    v_action := 'ai_key.standby';
    v_summary := format('Chave de IA "%s" (%s) virou reserva', v_key.label, v_key.key_hint);
  else
    update public.ai_provider_keys k
       set status = 'disabled', disabled_reason = 'Desativada no painel', disabled_at = now()
     where k.id = p_key_id;
    v_action := 'ai_key.disable';
    v_summary := format('Chave de IA "%s" (%s) desativada', v_key.label, v_key.key_hint);
  end if;

  if v_key.status = 'active' and p_status <> 'active' then
    select p.id, p.label, p.key_hint into v_prom_id, v_prom_label, v_prom_hint
      from public.ai_keys_promote_standby(v_key.provider, p_key_id) p;
    if v_prom_id is not null then
      v_summary := v_summary || format('; "%s" (%s) entrou em uso', v_prom_label, v_prom_hint);
    else
      v_summary := v_summary || '; sem reserva: o app passa a usar a variável OPENAI_API_KEY';
    end if;
  end if;

  perform public.admin_write_audit(
    v_action, 'ai_key', p_key_id::text, null, v_summary,
    jsonb_build_object(
      'before', jsonb_build_object('status', v_key.status),
      'after', jsonb_build_object('status', p_status),
      'previous_active', case when v_prev_id is null then null
        else jsonb_build_object('id', v_prev_id, 'label', v_prev_label, 'hint', v_prev_hint) end,
      'promoted', case when v_prom_id is null then null
        else jsonb_build_object('id', v_prom_id, 'label', v_prom_label, 'hint', v_prom_hint) end
    ),
    p_context
  );

  return jsonb_build_object('status', p_status, 'changed', true, 'promoted_id', v_prom_id);
end;
$$;

-- Resultado do botão "Testar agora" (o teste em si é feito pelo servidor).
create or replace function public.admin_record_ai_key_check(
  p_key_id uuid,
  p_ok boolean,
  p_error text default null,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.ai_provider_keys;
begin
  perform public.admin_assert();
  update public.ai_provider_keys k
     set last_checked_at = now(),
         last_check_ok = coalesce(p_ok, false),
         last_check_error = case when coalesce(p_ok, false) then null else left(nullif(trim(p_error), ''), 300) end
   where k.id = p_key_id
  returning * into v_key;
  if v_key.id is null then
    raise exception 'NOT_FOUND';
  end if;

  perform public.admin_write_audit(
    'ai_key.check', 'ai_key', p_key_id::text, null,
    format('Chave de IA "%s" (%s) testada: %s', v_key.label, v_key.key_hint,
      case when coalesce(p_ok, false) then 'funcionando' else 'com erro' end),
    jsonb_build_object('ok', coalesce(p_ok, false), 'error', left(nullif(trim(p_error), ''), 300)),
    p_context
  );
end;
$$;

-- Remove uma chave que não está em uso (o histórico guarda o nome e o final dela).
create or replace function public.admin_delete_ai_key(
  p_key_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.ai_provider_keys;
begin
  perform public.admin_assert();
  perform pg_advisory_xact_lock(hashtext('ai_provider_keys:openai'));

  select * into v_key from public.ai_provider_keys k where k.id = p_key_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_key.status = 'active' then
    raise exception 'AI_KEY_ACTIVE';
  end if;

  delete from public.ai_provider_keys k where k.id = p_key_id;

  perform public.admin_write_audit(
    'ai_key.delete', 'ai_key', p_key_id::text, null,
    format('Chave de IA "%s" (%s) removida', v_key.label, v_key.key_hint),
    jsonb_build_object('before', jsonb_build_object('label', v_key.label, 'hint', v_key.key_hint, 'status', v_key.status)),
    p_context
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------- servidor (troca automática)

-- A OpenAI recusou a chave em uso (HTTP 401): desativa e põe a reserva mais nova no lugar.
-- Trava contra cascata: no máximo 1 troca automática a cada 10 minutos (numa instabilidade de login da OpenAI, as
-- reservas não são queimadas uma atrás da outra). Só o servidor (service role) chama.
create or replace function public.ai_key_report_invalid(p_key_id uuid, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.ai_provider_keys;
  v_prom_id uuid;
  v_prom_label text;
  v_prom_hint text;
  v_error text := left(nullif(trim(coalesce(p_error, '')), ''), 240);
begin
  perform pg_advisory_xact_lock(hashtext('ai_provider_keys:openai'));

  select * into v_key from public.ai_provider_keys k where k.id = p_key_id for update;
  if not found or v_key.status <> 'active' then
    return jsonb_build_object('changed', false, 'throttled', false);
  end if;

  if exists (
    select 1 from public.admin_audit_log l
    where l.action = 'ai_key.auto_disabled' and l.created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('changed', false, 'throttled', true);
  end if;

  update public.ai_provider_keys k
     set status = 'disabled',
         disabled_reason = left('A OpenAI recusou a chave' || coalesce(': ' || v_error, ''), 300),
         disabled_at = now(),
         last_checked_at = now(),
         last_check_ok = false,
         last_check_error = v_error
   where k.id = p_key_id;

  select p.id, p.label, p.key_hint into v_prom_id, v_prom_label, v_prom_hint
    from public.ai_keys_promote_standby(v_key.provider, p_key_id) p;

  perform public.admin_write_audit(
    'ai_key.auto_disabled', 'ai_key', p_key_id::text, null,
    format('A OpenAI recusou a chave "%s" (%s): desativada automaticamente; %s', v_key.label, v_key.key_hint,
      case when v_prom_id is null then 'sem reserva, o app passou a usar a variável OPENAI_API_KEY'
        else format('"%s" (%s) entrou em uso', v_prom_label, v_prom_hint) end),
    jsonb_build_object(
      'error', v_error,
      'promoted', case when v_prom_id is null then null
        else jsonb_build_object('id', v_prom_id, 'label', v_prom_label, 'hint', v_prom_hint) end
    ),
    '{}'::jsonb
  );

  return jsonb_build_object('changed', true, 'throttled', false, 'promoted_id', v_prom_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------- privilégios das funções

revoke execute on function public.ai_keys_promote_standby(text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.ai_key_report_invalid(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_key_report_invalid(uuid, text) to service_role;

revoke execute on function public.admin_list_ai_keys() from public, anon;
revoke execute on function public.admin_add_ai_key(uuid, text, text, text, text, boolean, jsonb) from public, anon;
revoke execute on function public.admin_set_ai_key_status(uuid, text, jsonb) from public, anon;
revoke execute on function public.admin_record_ai_key_check(uuid, boolean, text, jsonb) from public, anon;
revoke execute on function public.admin_delete_ai_key(uuid, jsonb) from public, anon;

grant execute on function public.admin_list_ai_keys() to authenticated;
grant execute on function public.admin_add_ai_key(uuid, text, text, text, text, boolean, jsonb) to authenticated;
grant execute on function public.admin_set_ai_key_status(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_record_ai_key_check(uuid, boolean, text, jsonb) to authenticated;
grant execute on function public.admin_delete_ai_key(uuid, jsonb) to authenticated;
