-- Testes de RLS e da reserva de contas do Escudo de Reputação. Rodar no Supabase da v2:
--   npx supabase db query --linked -f supabase/tests/reputacao_rls.sql
-- Sucesso = erro "TESTES_REPUTACAO_OK". Tudo é desfeito no final (o erro desfaz a transação inteira).
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_a2 uuid;
  v_acc_b uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rep-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rep-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  -- O Escudo vale para todos os planos (A no Starter com 2 contas, B no teste grátis).
  update public.organizations set plan = 'starter', subscription_status = 'active', ml_accounts_limit = 2
   where id = v_org_a;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 940000001, 'REP A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 940000003, 'REP A2')
    returning id into v_acc_a2;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 940000002, 'REP B')
    returning id into v_acc_b;

  -- A reserva cria a linha das contas novas e já as entrega (tudo vencido).
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id in (v_acc_a, v_acc_b);
  if v_count <> 2 then raise exception 'FALHA: reserva devolveu % contas novas (esperado 2)', v_count; end if;
  select count(*) into v_count from public.reputation_sync where ml_account_id in (v_acc_a, v_acc_a2, v_acc_b);
  if v_count <> 3 then raise exception 'FALHA: % linhas de sincronização (esperado 3)', v_count; end if;
  -- Já reservada: não sai de novo.
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conta reservada duas vezes'; end if;
  -- Sem rodada vencida: não sai.
  update public.reputation_sync
     set locked_until = null, next_reputation_at = now() + interval '30 minutes',
         next_shipments_at = now() + interval '10 minutes', next_claims_at = now() + interval '5 minutes'
   where ml_account_id = v_acc_a;
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conta sem rodada vencida foi reservada'; end if;
  -- "Atualizar agora" reserva a conta pedida mesmo sem rodada vencida (e só ela).
  select count(*) into v_count from public.claim_reputation_sync(100, 60, v_acc_a) c;
  if v_count <> 1 then raise exception 'FALHA: atualizar agora não reservou a conta'; end if;
  update public.reputation_sync set locked_until = null, next_claims_at = now() - interval '1 minute'
   where ml_account_id = v_acc_a;
  -- Token inválido, conta desconectada e organização bloqueada ficam de fora.
  update public.ml_accounts set token_status = 'invalid' where id = v_acc_a;
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conta com token inválido foi reservada'; end if;
  update public.ml_accounts set token_status = 'valid', status = 'disconnected' where id = v_acc_a;
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conta desconectada foi reservada'; end if;
  update public.ml_accounts set status = 'active' where id = v_acc_a;
  update public.organizations set subscription_status = 'trialing', trial_ends_at = now() - interval '1 day'
   where id = v_org_a;
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: organização bloqueada foi reservada'; end if;
  update public.organizations set subscription_status = 'active' where id = v_org_a;
  select count(*) into v_count from public.claim_reputation_sync(100) c where c.ml_account_id = v_acc_a;
  if v_count <> 1 then raise exception 'FALHA: conta com acesso não foi reservada de novo'; end if;

  -- Dados de teste (o servidor grava com o service role).
  insert into public.reputation_settings (organization_id, email_alerts) values (v_org_a, false);
  insert into public.reputation_snapshots (organization_id, ml_account_id, color, period_days, signature)
  values (v_org_a, v_acc_a, 'green', 60, 'a'), (v_org_b, v_acc_b, 'none', 365, 'b');
  insert into public.reputation_shipments (organization_id, ml_account_id, shipment_id, stage)
  values (v_org_a, v_acc_a, 1, 'waiting'), (v_org_b, v_acc_b, 2, 'waiting');
  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status)
  values (v_org_a, v_acc_a, 11, 'mediations', 'opened'), (v_org_b, v_acc_b, 12, 'mediations', 'opened');
  insert into public.reputation_alerts (organization_id, ml_account_id, kind, dedupe_key, severity, title)
  values (v_org_a, v_acc_a, 'shipment_late', 'shipment_late:1', 'urgent', 'Envio atrasado'),
         (v_org_b, v_acc_b, 'shipment_late', 'shipment_late:2', 'urgent', 'Envio atrasado');

  -- Mesma chave de alerta na mesma conta não duplica.
  v_failed := false;
  begin
    insert into public.reputation_alerts (organization_id, ml_account_id, kind, dedupe_key, severity, title)
    values (v_org_a, v_acc_a, 'shipment_late', 'shipment_late:1', 'urgent', 'De novo');
    v_failed := true;
  exception when unique_violation then null;
  end;
  if v_failed then raise exception 'FALHA: alerta repetido aceito'; end if;

  -- Usuário A vê só a própria organização.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.reputation_snapshots;
  if v_count <> 1 then raise exception 'FALHA: A vê % termômetros (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_shipments;
  if v_count <> 1 then raise exception 'FALHA: A vê % envios (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_claims;
  if v_count <> 1 then raise exception 'FALHA: A vê % reclamações (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_alerts;
  if v_count <> 1 then raise exception 'FALHA: A vê % alertas (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_settings;
  if v_count <> 1 then raise exception 'FALHA: A vê % preferências (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_sync;
  if v_count <> 2 then raise exception 'FALHA: A vê % rodadas (esperado 2)', v_count; end if;

  v_failed := false;
  begin
    update public.reputation_settings set email_alerts = true where organization_id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar as preferências'; end if;

  v_failed := false;
  begin
    insert into public.reputation_alerts (organization_id, ml_account_id, kind, dedupe_key, severity, title)
    values (v_org_a, v_acc_a, 'margin_low', 'x', 'urgent', 'x');
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue criar alertas'; end if;

  v_failed := false;
  begin
    delete from public.reputation_claims;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue apagar reclamações'; end if;

  v_failed := false;
  begin
    perform 1 from public.claim_reputation_sync(1);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue chamar claim_reputation_sync'; end if;

  -- Usuário B vê só a loja B.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.reputation_alerts;
  if v_count <> 1 then raise exception 'FALHA: B vê % alertas (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_settings;
  if v_count <> 0 then raise exception 'FALHA: B vê as preferências de A'; end if;

  -- Visitante (anon) não lê nada.
  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    select count(*) into v_count from public.reputation_snapshots;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler o termômetro'; end if;

  raise exception 'TESTES_REPUTACAO_OK';
end;
$$;

