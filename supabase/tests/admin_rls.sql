-- Testes de segurança e das funções do painel do administrador. Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/admin_rls.sql
-- Sucesso = erro "TESTES_ADMIN_OK". Tudo é desfeito no final (o erro desfaz a transação).
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_org_user uuid;
  v_account uuid;
  v_now numeric := extract(epoch from now());
  v_fresh text;
  v_old text;
  v_aal1 text;
  v_not_admin text;
  v_result jsonb;
  v_count integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'adm-' || v_admin || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cli-' || v_user || '@teste.local', '', now(), '{}', '{"full_name":"Cliente Teste"}', now(), now());

  update public.profiles set is_platform_admin = true where id = v_admin;
  select organization_id into v_org_user from public.organization_members where user_id = v_user;
  update public.organizations set name = 'Loja Admin Teste' where id = v_org_user;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname, auto_reply_enabled, after_sale_enabled)
  values (v_org_user, 930000001, 'LOJA_ADMIN_TESTE', true, true)
  returning id into v_account;

  insert into public.ai_usage_events (organization_id, ml_account_id, feature, model, input_tokens, cached_input_tokens,
                                      output_tokens, total_tokens, cost_usd, success, latency_ms)
  values
    (v_org_user, v_account, 'question_answer', 'gpt-6-luna', 2000, 1000, 200, 2200, 0.00021, true, 900),
    (v_org_user, v_account, 'assistant_test', 'gpt-6-luna', 1500, 0, 100, 1600, 0.0002, false, 300);

  v_fresh := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'password', 'timestamp', v_now - 100),
    jsonb_build_object('method', 'totp', 'timestamp', v_now - 60)))::text;
  v_old := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', v_now - 50000)))::text;
  v_aal1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal1', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'password', 'timestamp', v_now - 60)))::text;
  v_not_admin := jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', v_now - 60)))::text;

  -- 1. anon não executa as funções do painel
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.admin_overview();
    raise exception 'FALHA: anon executou admin_overview';
  exception when insufficient_privilege then null;
  end;

  -- 2. usuário comum (mesmo com 2 etapas) não é admin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_not_admin, true);
  begin
    perform public.admin_overview();
    raise exception 'FALHA: usuário comum acessou o painel';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_update_organization(v_org_user, '{"billing_exempt": true}'::jsonb);
    raise exception 'FALHA: usuário comum alterou organização';
  exception when insufficient_privilege then null;
  end;

  -- 3. admin sem a verificação em 2 etapas (aal1)
  perform set_config('request.jwt.claims', v_aal1, true);
  begin
    perform public.admin_list_organizations();
    raise exception 'FALHA: admin aal1 acessou o painel';
  exception when insufficient_privilege then null;
  end;

  -- 4. admin com o código verificado há mais de 12 horas
  perform set_config('request.jwt.claims', v_old, true);
  begin
    perform public.admin_finance();
    raise exception 'FALHA: verificação antiga aceita';
  exception when insufficient_privilege then null;
  end;

  -- 5. admin com verificação recente: tudo funciona
  perform set_config('request.jwt.claims', v_fresh, true);
  v_result := public.admin_overview();
  if (v_result -> 'organizations' ->> 'total')::integer < 1 then
    raise exception 'FALHA: visão geral sem clientes';
  end if;
  if (v_result -> 'ai' ->> 'errors_24h')::integer < 1 then
    raise exception 'FALHA: visão geral sem erros de IA';
  end if;
  if jsonb_array_length(v_result -> 'signups_daily') <> 30 or jsonb_array_length(v_result -> 'ai_daily') <> 30 then
    raise exception 'FALHA: séries diárias com tamanho errado';
  end if;

  v_result := public.admin_list_organizations('cli-' || v_user, null, null, 'recent', 25, 0);
  if (v_result ->> 'total')::integer <> 1 or v_result -> 'rows' -> 0 ->> 'organization_id' <> v_org_user::text then
    raise exception 'FALHA: busca por e-mail: %', v_result ->> 'total';
  end if;
  if v_result -> 'rows' -> 0 ->> 'status' <> 'trial' or (v_result -> 'rows' -> 0 ->> 'ai_calls_30d')::integer <> 2 then
    raise exception 'FALHA: linha do cliente: %', v_result -> 'rows' -> 0;
  end if;
  v_result := public.admin_list_organizations('LOJA_ADMIN', 'trial', 'none', 'ai_cost', 25, 0);
  if (v_result ->> 'total')::integer <> 1 then
    raise exception 'FALHA: busca por apelido do ML';
  end if;
  v_result := public.admin_list_organizations('100%_', null, null, 'name', 25, 0);
  if (v_result ->> 'total')::integer <> 0 then
    raise exception 'FALHA: curingas da busca não escapados';
  end if;

  v_result := public.admin_organization_detail(v_org_user);
  if v_result -> 'organization' ->> 'name' <> 'Loja Admin Teste'
     or jsonb_array_length(v_result -> 'members') <> 1
     or jsonb_array_length(v_result -> 'ml_accounts') <> 1
     or jsonb_array_length(v_result -> 'usage_daily') <> 30 then
    raise exception 'FALHA: ficha do cliente';
  end if;
  if public.admin_organization_detail(gen_random_uuid()) is not null then
    raise exception 'FALHA: ficha de organização inexistente';
  end if;

  v_result := public.admin_ai_usage(now() - interval '7 days', now() + interval '1 minute');
  if (v_result -> 'totals' ->> 'calls')::integer < 2 or (v_result -> 'totals' ->> 'failed')::integer < 1 then
    raise exception 'FALHA: uso de IA';
  end if;
  perform public.admin_finance();
  perform public.admin_operations();

  -- 6. funções internas e tabelas não são acessíveis nem para o admin pelo navegador
  begin
    perform * from public.admin_org_rows();
    raise exception 'FALHA: admin_org_rows exposta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_write_audit('x.y', null, null, null, 'forjado', '{}'::jsonb, '{}'::jsonb);
    raise exception 'FALHA: admin_write_audit exposta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_usage_events limit 1;
    raise exception 'FALHA: ai_usage_events legível pelo navegador';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.admin_audit_log limit 1;
    raise exception 'FALHA: admin_audit_log legível pelo navegador';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_settings limit 1;
    raise exception 'FALHA: platform_settings legível pelo navegador';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.admin_organization_notes limit 1;
    raise exception 'FALHA: notas internas legíveis pelo navegador';
  exception when insufficient_privilege then null;
  end;

  -- 7. alterações auditadas
  v_result := public.admin_update_organization(
    v_org_user, '{"monthly_price": 129.9, "billing_exempt": false, "name": "Loja Admin Teste"}'::jsonb,
    '{"ip": "203.0.113.7", "user_agent": "teste"}'::jsonb);
  if v_result <> '{"monthly_price": 129.9}'::jsonb then
    raise exception 'FALHA: diff da alteração: %', v_result;
  end if;
  begin
    perform public.admin_update_organization(v_org_user, '{"is_platform_admin": true}'::jsonb);
    raise exception 'FALHA: campo não permitido aceito';
  exception when raise_exception then
    if sqlerrm not like 'INVALID_FIELD%' then raise; end if;
  end;
  perform public.admin_set_organization_notes(v_org_user, 'Cliente da v1, paga por Pix.', '{}'::jsonb);
  perform public.admin_update_profile(v_user, '{"whatsapp": "11987654321"}'::jsonb, '{}'::jsonb);
  perform public.admin_pause_ml_account(v_account, 'answers', '{}'::jsonb);
  perform public.admin_update_platform_settings('{"ai_paused": true, "ai_paused_reason": "teste"}'::jsonb, '{}'::jsonb);
  perform public.admin_log_event('user.ban', 'user', v_user::text, v_org_user, 'Acesso bloqueado', '{}'::jsonb, '{}'::jsonb);

  v_result := public.admin_list_audit(v_org_user, null, 50, 0);
  if (v_result ->> 'total')::integer <> 5 then
    raise exception 'FALHA: histórico do cliente com % linhas', v_result ->> 'total';
  end if;
  v_result := public.admin_list_audit(null, 'platform.', 50, 0);
  if v_result -> 'rows' -> 0 ->> 'action' <> 'platform.ai_paused' then
    raise exception 'FALHA: pausa geral não auditada';
  end if;

  -- de volta ao dono do banco para conferir o que foi gravado
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.admin_audit_log
  where organization_id = v_org_user and actor_id = v_admin and ip = '203.0.113.7' and action = 'organization.update'
    and details -> 'before' ->> 'monthly_price' is null and (details -> 'after' ->> 'monthly_price')::numeric = 129.9;
  if v_count <> 1 then
    raise exception 'FALHA: auditoria da alteração sem antes/depois/IP';
  end if;
  if (select auto_reply_enabled or not after_sale_enabled from public.ml_accounts where id = v_account) then
    raise exception 'FALHA: pausa só das respostas';
  end if;
  if not (select ai_paused and ai_paused_at is not null and ai_paused_by = v_admin from public.platform_settings where id) then
    raise exception 'FALHA: pausa geral não gravada';
  end if;
  if (select whatsapp from public.profiles where id = v_user) <> '11987654321' then
    raise exception 'FALHA: WhatsApp não alterado';
  end if;

  -- 8. histórico é só inclusão (nem o dono do banco altera)
  begin
    update public.admin_audit_log set summary = 'adulterado' where organization_id = v_org_user;
    raise exception 'FALHA: histórico alterado';
  exception when raise_exception then
    if sqlerrm <> 'ADMIN_AUDIT_APPEND_ONLY' then raise; end if;
  end;
  begin
    delete from public.admin_audit_log where organization_id = v_org_user;
    raise exception 'FALHA: histórico apagado';
  exception when raise_exception then
    if sqlerrm <> 'ADMIN_AUDIT_APPEND_ONLY' then raise; end if;
  end;

  raise exception 'TESTES_ADMIN_OK';
end;
$$;
