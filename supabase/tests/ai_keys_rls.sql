-- Testes de segurança e das funções das chaves de IA (migração 20261013012212_chaves_ia.sql).
-- O banco da v2 é PRODUÇÃO: o bloco inteiro é UM comando e termina sempre em erro, que desfaz tudo (nada fica gravado,
-- nem as linhas de teste do histórico). Rodar:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/ai_keys_rls.sql
-- Sucesso = erro "TESTES_CHAVES_IA_OK".
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_now numeric := extract(epoch from now());
  v_fresh text;
  v_aal1 text;
  v_not_admin text;
  v_k1 uuid := gen_random_uuid();
  v_k2 uuid := gen_random_uuid();
  v_k3 uuid := gen_random_uuid();
  v_cipher text := 'v1.' || repeat('Q', 40);
  v_active uuid;
  v_result jsonb;
  v_count integer;
begin
  -- Ponto de partida conhecido (desfeito no fim, junto com o resto).
  delete from public.ai_provider_keys;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'adm-' || v_admin || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cli-' || v_user || '@teste.local', '', now(), '{}', '{"full_name":"Cliente Teste"}', now(), now());
  update public.profiles set is_platform_admin = true where id = v_admin;

  v_fresh := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', v_now - 60)))::text;
  v_aal1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal1', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'password', 'timestamp', v_now - 60)))::text;
  v_not_admin := jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', v_now - 60)))::text;

  -- 1. visitante (anon): nem a tabela nem as funções
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.ai_provider_keys;
    raise exception 'FALHA: anon leu ai_provider_keys';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_ai_keys();
    raise exception 'FALHA: anon executou admin_list_ai_keys';
  exception when insufficient_privilege then null;
  end;

  -- 2. usuário logado comum (mesmo com 2 etapas)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_not_admin, true);
  begin
    perform 1 from public.ai_provider_keys;
    raise exception 'FALHA: usuário comum leu ai_provider_keys';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_ai_keys();
    raise exception 'FALHA: usuário comum listou as chaves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_add_ai_key(v_k1, 'X', v_cipher, 'sk-…aaaa', repeat('a', 64), true);
    raise exception 'FALHA: usuário comum cadastrou chave';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_key_report_invalid(v_k1, 'x');
    raise exception 'FALHA: usuário comum chamou a troca automática';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.ai_keys_promote_standby('openai', null);
    raise exception 'FALHA: usuário comum chamou função interna';
  exception when insufficient_privilege then null;
  end;

  -- 3. admin sem a 2ª etapa
  perform set_config('request.jwt.claims', v_aal1, true);
  begin
    perform public.admin_add_ai_key(v_k1, 'X', v_cipher, 'sk-…aaaa', repeat('a', 64), true);
    raise exception 'FALHA: admin aal1 cadastrou chave';
  exception when insufficient_privilege then null;
  end;

  -- 4. admin com 2 etapas recente
  perform set_config('request.jwt.claims', v_fresh, true);
  begin
    perform 1 from public.ai_provider_keys;
    raise exception 'FALHA: admin leu a tabela direto (só pelas funções)';
  exception when insufficient_privilege then null;
  end;

  v_result := public.admin_add_ai_key(v_k1, ' Chave 1 ', v_cipher, 'sk-proj-…aaaa', repeat('a', 64), false);
  if v_result ->> 'status' <> 'active' then
    raise exception 'FALHA: 1ª chave devia entrar em uso: %', v_result;
  end if;
  v_result := public.admin_add_ai_key(v_k2, 'Chave 2', v_cipher, 'sk-proj-…bbbb', repeat('b', 64), false);
  if v_result ->> 'status' <> 'standby' then
    raise exception 'FALHA: 2ª chave devia ser reserva: %', v_result;
  end if;
  v_result := public.admin_add_ai_key(v_k3, 'Chave 3', v_cipher, 'sk-proj-…cccc', repeat('c', 64), true);
  if v_result ->> 'status' <> 'active' then
    raise exception 'FALHA: chave com "usar agora" devia entrar em uso: %', v_result;
  end if;
  begin
    perform public.admin_add_ai_key(gen_random_uuid(), 'Repetida', v_cipher, 'sk-proj-…aaaa', repeat('a', 64), false);
    raise exception 'FALHA: aceitou chave repetida';
  exception when raise_exception then
    if sqlerrm not like 'AI_KEY_DUPLICATE%' then raise; end if;
  end;
  begin
    perform public.admin_add_ai_key(gen_random_uuid(), 'Ruim', v_cipher, 'sk-proj-…dddd', 'nao-e-hex', false);
    raise exception 'FALHA: aceitou impressão digital inválida';
  exception when check_violation then null;
  end;

  v_result := public.admin_list_ai_keys();
  if jsonb_array_length(v_result -> 'keys') <> 3 then
    raise exception 'FALHA: lista com % chaves', jsonb_array_length(v_result -> 'keys');
  end if;
  if v_result -> 'keys' -> 0 ->> 'id' <> v_k3::text or v_result -> 'keys' -> 0 ->> 'status' <> 'active' then
    raise exception 'FALHA: a chave em uso devia vir primeiro: %', v_result -> 'keys' -> 0;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_result -> 'keys') k
                 where k ->> 'id' = v_k1::text and k ->> 'label' = 'Chave 1' and k ->> 'status' = 'standby') then
    raise exception 'FALHA: 1ª chave devia virar reserva com o nome aparado: %', v_result -> 'keys';
  end if;
  if position(repeat('Q', 40) in v_result::text) > 0 or v_result::text like '%ciphertext%'
     or v_result::text like '%fingerprint%' then
    raise exception 'FALHA: a lista expôs o conteúdo criptografado';
  end if;
  if (v_result -> 'env' ->> 'calls_30d') is null or jsonb_typeof(v_result -> 'recent_events') <> 'array' then
    raise exception 'FALHA: lista sem uso da variável ou eventos: %', v_result;
  end if;

  -- trocar a chave em uso: a anterior vira reserva (sempre no máximo 1 em uso)
  v_result := public.admin_set_ai_key_status(v_k1, 'active');
  if not (v_result ->> 'changed')::boolean then
    raise exception 'FALHA: troca não aconteceu';
  end if;
  v_result := public.admin_list_ai_keys();
  select count(*) into v_count from jsonb_array_elements(v_result -> 'keys') k where k ->> 'status' = 'active';
  if v_count <> 1 or v_result -> 'keys' -> 0 ->> 'id' <> v_k1::text then
    raise exception 'FALHA: depois da troca: % em uso, primeira %', v_count, v_result -> 'keys' -> 0 ->> 'id';
  end if;
  begin
    perform public.admin_set_ai_key_status(v_k1, 'apagada');
    raise exception 'FALHA: aceitou situação inválida';
  exception when raise_exception then
    if sqlerrm not like 'INVALID_STATUS%' then raise; end if;
  end;

  -- desativar a chave em uso: a reserva entra no lugar
  v_result := public.admin_set_ai_key_status(v_k1, 'disabled');
  if (v_result ->> 'promoted_id') is null or (v_result ->> 'promoted_id')::uuid not in (v_k2, v_k3) then
    raise exception 'FALHA: reserva não entrou em uso: %', v_result;
  end if;
  v_active := (v_result ->> 'promoted_id')::uuid;
  begin
    perform public.admin_delete_ai_key(v_active);
    raise exception 'FALHA: removeu a chave em uso';
  exception when raise_exception then
    if sqlerrm not like 'AI_KEY_ACTIVE%' then raise; end if;
  end;
  perform public.admin_record_ai_key_check(v_k1, false, 'Chave recusada');
  perform public.admin_delete_ai_key(v_k1);
  v_result := public.admin_list_ai_keys();
  if jsonb_array_length(v_result -> 'keys') <> 2 then
    raise exception 'FALHA: chave não foi removida';
  end if;
  begin
    perform public.admin_record_ai_key_check(v_k1, true);
    raise exception 'FALHA: teste de chave removida';
  exception when raise_exception then
    if sqlerrm not like 'NOT_FOUND%' then raise; end if;
  end;

  v_result := public.admin_list_audit(null, 'ai_key.', 50, 0);
  if (v_result ->> 'total')::integer < 7 then
    raise exception 'FALHA: histórico das chaves com % registros', v_result ->> 'total';
  end if;

  -- 5. servidor (service role): só lê a tabela; escreve só pelas funções
  -- Trava de 1 s nesta transação: trocas automáticas reais dos últimos 10 min (histórico imutável) não atrapalham.
  perform set_config('app.ai_key_switch_cooldown_seconds', '1', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  select count(*) into v_count from public.ai_provider_keys where key_ciphertext = v_cipher;
  if v_count <> 2 then
    raise exception 'FALHA: servidor não leu as chaves (%)', v_count;
  end if;
  begin
    update public.ai_provider_keys set status = 'disabled' where id = v_active;
    raise exception 'FALHA: servidor alterou a tabela direto';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_provider_keys where id = v_active;
    raise exception 'FALHA: servidor apagou direto';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_ai_keys();
    raise exception 'FALHA: servidor sem sessão de admin listou pelo painel';
  exception when insufficient_privilege then null;
  end;

  -- chave fora de uso: nada muda
  v_result := public.ai_key_report_invalid(case when v_active = v_k2 then v_k3 else v_k2 end, 'x');
  if (v_result ->> 'changed')::boolean then
    raise exception 'FALHA: desativou uma reserva por engano';
  end if;
  -- chave em uso recusada pela OpenAI: desativa e a reserva entra
  v_result := public.ai_key_report_invalid(v_active, 'Incorrect API key provided: sk-proj-****');
  if not (v_result ->> 'changed')::boolean or (v_result ->> 'promoted_id') is null then
    raise exception 'FALHA: troca automática: %', v_result;
  end if;
  select count(*) into v_count from public.ai_provider_keys where status = 'active' and id = (v_result ->> 'promoted_id')::uuid;
  if v_count <> 1 then
    raise exception 'FALHA: reserva não ficou em uso';
  end if;
  select count(*) into v_count from public.ai_provider_keys
   where id = v_active and status = 'disabled' and not last_check_ok and disabled_reason like 'A OpenAI recusou a chave%';
  if v_count <> 1 then
    raise exception 'FALHA: chave recusada não foi marcada';
  end if;
  -- trava contra cascata: a 2ª troca automática dentro da trava é recusada (em produção, 10 minutos)
  v_result := public.ai_key_report_invalid((v_result ->> 'promoted_id')::uuid, 'x');
  if (v_result ->> 'changed')::boolean or not (v_result ->> 'throttled')::boolean then
    raise exception 'FALHA: trava de 10 minutos: %', v_result;
  end if;

  -- uso por chave e a nova função "key_check"
  insert into public.ai_usage_events (feature, model, ai_key_id, key_source, success)
  values ('key_check', 'gpt-6-luna', v_active, 'panel', true), ('question_answer', 'gpt-6-luna', null, 'env', true);
  begin
    insert into public.ai_usage_events (feature, model, key_source) values ('question_answer', 'gpt-6-luna', 'outra');
    raise exception 'FALHA: aceitou origem de chave inválida';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_usage_events (feature, model) values ('qualquer', 'gpt-6-luna');
    raise exception 'FALHA: aceitou função inválida';
  exception when check_violation then null;
  end;

  -- 6. de volta ao admin: uso aparece na lista
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_fresh, true);
  v_result := public.admin_list_ai_keys();
  if (v_result -> 'env' ->> 'calls_30d')::integer < 1 then
    raise exception 'FALHA: uso da variável de ambiente não contado';
  end if;
  select count(*) into v_count from jsonb_array_elements(v_result -> 'keys') k
   where k ->> 'id' = v_active::text and (k ->> 'calls_30d')::integer = 1 and k ->> 'last_used_at' is not null;
  if v_count <> 1 then
    raise exception 'FALHA: uso por chave não contado: %', v_result -> 'keys';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_result -> 'recent_events') e
                 where e ->> 'action' = 'ai_key.auto_disabled') then
    raise exception 'FALHA: troca automática fora dos eventos recentes: %', v_result -> 'recent_events';
  end if;

  raise exception 'TESTES_CHAVES_IA_OK';
end;
$$;
