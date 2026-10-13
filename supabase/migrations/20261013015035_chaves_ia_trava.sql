-- Trava da troca automática de chave de IA (ai_key_report_invalid) com tempo ajustável SÓ para os testes SQL.
-- Motivo: supabase/tests/ai_keys_rls.sql roda no banco de produção, e uma troca automática real nos últimos 10 minutos
-- (o histórico é imutável) fazia o teste falhar. Em produção nada define app.ai_key_switch_cooldown_seconds: continua
-- 600 s (10 minutos). Só o servidor (service role) executa a função; os privilégios dela não mudam (create or replace).

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
  -- 600 s (10 min) em produção; só os testes SQL definem um valor menor nesta transação.
  v_cooldown integer := least(greatest(coalesce(
    nullif(current_setting('app.ai_key_switch_cooldown_seconds', true), '')::integer, 600), 1), 3600);
begin
  perform pg_advisory_xact_lock(hashtext('ai_provider_keys:openai'));

  select * into v_key from public.ai_provider_keys k where k.id = p_key_id for update;
  if not found or v_key.status <> 'active' then
    return jsonb_build_object('changed', false, 'throttled', false);
  end if;

  if exists (
    select 1 from public.admin_audit_log l
    where l.action = 'ai_key.auto_disabled' and l.created_at > now() - make_interval(secs => v_cooldown)
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
