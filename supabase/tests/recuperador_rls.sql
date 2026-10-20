-- Testes do Recuperador (devoluções, achados do Raio-X, histórico imutável, alertas e uso da IA).
--   npx supabase db query --linked -f supabase/tests/recuperador_rls.sql
-- Sucesso = erro "TESTES_RECUPERADOR_OK". Tudo é desfeito no final.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_b uuid;
  v_claim_a uuid;
  v_claim_b uuid;
  v_return_a uuid;
  v_return_b uuid;
  v_action uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rec-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rec-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());
  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 942000001, 'REC A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 942000002, 'REC B')
    returning id into v_acc_b;

  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status)
  values (v_org_a, v_acc_a, 31, 'returns', 'opened') returning id into v_claim_a;
  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status)
  values (v_org_b, v_acc_b, 32, 'returns', 'closed') returning id into v_claim_b;

  insert into public.recovery_sync (ml_account_id, organization_id) values (v_acc_a, v_org_a), (v_acc_b, v_org_b);
  insert into public.recovery_scans (ml_account_id, organization_id, status) values (v_acc_a, v_org_a, 'running'),
    (v_acc_b, v_org_b, 'done');
  insert into public.recovery_returns (organization_id, ml_account_id, claim_row_id, claim_id, return_id, phase, claim_status,
                                       can_review_ok, can_review_fail, amount)
  values (v_org_a, v_acc_a, v_claim_a, 31, 701, 'needs_review', 'opened', true, true, 120.5) returning id into v_return_a;
  insert into public.recovery_returns (organization_id, ml_account_id, claim_row_id, claim_id, return_id, phase, claim_status)
  values (v_org_b, v_acc_b, v_claim_b, 32, 702, 'closed', 'closed') returning id into v_return_b;
  insert into public.recovery_findings (organization_id, ml_account_id, return_row_id, kind, dedupe_key, confidence, amount)
  values (v_org_a, v_acc_a, v_return_a, 'return_unsaleable_unreimbursed', 'return:31', 'medium', 120.5),
         (v_org_b, v_acc_b, v_return_b, 'return_reimbursed', 'return:32', 'high', 80);
  insert into public.recovery_actions (organization_id, ml_account_id, return_row_id, claim_row_id, claim_id, return_id,
                                       action, status, performed_by)
  values (v_org_a, v_acc_a, v_return_a, v_claim_a, 31, 701, 'return_review_fail', 'success', v_user_a) returning id into v_action;
  insert into public.recovery_actions (organization_id, ml_account_id, return_row_id, claim_row_id, claim_id, return_id,
                                       action, status, performed_by)
  values (v_org_b, v_acc_b, v_return_b, v_claim_b, 32, 702, 'return_review_ok', 'failed', v_user_b);

  -- Uma devolução por reclamação e um achado por chave.
  v_failed := false;
  begin
    insert into public.recovery_returns (organization_id, ml_account_id, claim_row_id, claim_id, phase, claim_status)
    values (v_org_a, v_acc_a, v_claim_a, 31, 'waiting', 'opened');
    v_failed := true;
  exception when unique_violation then null;
  end;
  if v_failed then raise exception 'FALHA: devolução repetida aceita'; end if;
  v_failed := false;
  begin
    insert into public.recovery_findings (organization_id, ml_account_id, kind, dedupe_key, confidence)
    values (v_org_a, v_acc_a, 'return_reimbursed', 'return:31', 'high');
    v_failed := true;
  exception when unique_violation then null;
  end;
  if v_failed then raise exception 'FALHA: achado repetido aceito'; end if;

  -- Fase desconhecida é recusada.
  v_failed := false;
  begin
    update public.recovery_returns set phase = 'qualquer' where id = v_return_a;
    v_failed := true;
  exception when check_violation then null;
  end;
  if v_failed then raise exception 'FALHA: fase desconhecida aceita'; end if;

  -- Histórico de revisões é imutável até para o dono do banco.
  v_failed := false;
  begin
    update public.recovery_actions set status = 'failed' where id = v_action;
    v_failed := true;
  exception when raise_exception then
    if sqlerrm <> 'RECOVERY_ACTIONS_IMMUTABLE' then raise; end if;
  end;
  if v_failed then raise exception 'FALHA: histórico de revisões alterado'; end if;
  v_failed := false;
  begin
    delete from public.recovery_actions where id = v_action;
    v_failed := true;
  exception when raise_exception then
    if sqlerrm <> 'RECOVERY_ACTIONS_IMMUTABLE' then raise; end if;
  end;
  if v_failed then raise exception 'FALHA: histórico de revisões apagado'; end if;

  -- Alertas aceitam os 3 tipos novos e continuam aceitando os antigos (e recusando desconhecidos).
  insert into public.reputation_alerts (organization_id, ml_account_id, kind, dedupe_key, severity, title)
  values (v_org_a, v_acc_a, 'return_review_due', 'return_review_due:31', 'urgent', 'Chegou a devolução'),
         (v_org_a, v_acc_a, 'return_review_closing', 'return_review_closing:31', 'urgent', 'Prazo da revisão'),
         (v_org_a, v_acc_a, 'return_recovered', 'return_recovered:31', 'info', 'O ML ressarciu'),
         (v_org_a, v_acc_a, 'claim_new', 'claim_new:31', 'urgent', 'Reclamação nova');
  v_failed := false;
  begin
    insert into public.reputation_alerts (organization_id, ml_account_id, kind, dedupe_key, severity, title)
    values (v_org_a, v_acc_a, 'qualquer_coisa', 'x', 'info', 'x');
    v_failed := true;
  exception when check_violation then null;
  end;
  if v_failed then raise exception 'FALHA: tipo de alerta desconhecido aceito'; end if;

  -- Uso da IA aceita o relato da devolução e os valores antigos (e continua recusando desconhecidos).
  insert into public.ai_usage_events (organization_id, ml_account_id, feature, model)
  values (v_org_a, v_acc_a, 'recovery_return_message', 'teste'),
         (v_org_a, v_acc_a, 'reputation_claim_analysis', 'teste'),
         (v_org_a, v_acc_a, 'question_answer', 'teste');
  v_failed := false;
  begin
    insert into public.ai_usage_events (organization_id, feature, model) values (v_org_a, 'qualquer_coisa', 'teste');
    v_failed := true;
  exception when check_violation then null;
  end;
  if v_failed then raise exception 'FALHA: função de IA desconhecida aceita'; end if;

  -- Apagar a conta do ML apaga devoluções e achados (cascata) e não é travado pelo histórico (sem chave estrangeira).
  delete from public.ml_accounts where id = v_acc_b;
  select count(*) into v_count from public.recovery_returns where id = v_return_b;
  if v_count <> 0 then raise exception 'FALHA: devolução ficou depois de apagar a conta'; end if;
  select count(*) into v_count from public.recovery_findings where ml_account_id = v_acc_b;
  if v_count <> 0 then raise exception 'FALHA: achado ficou depois de apagar a conta'; end if;
  select count(*) into v_count from public.recovery_actions where return_row_id = v_return_b;
  if v_count <> 1 then raise exception 'FALHA: histórico de revisões sumiu com a conta'; end if;
  -- Recria a conta B para os testes de isolamento.
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 942000003, 'REC B2')
    returning id into v_acc_b;
  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status)
  values (v_org_b, v_acc_b, 33, 'returns', 'opened') returning id into v_claim_b;
  insert into public.recovery_sync (ml_account_id, organization_id) values (v_acc_b, v_org_b);
  insert into public.recovery_scans (ml_account_id, organization_id) values (v_acc_b, v_org_b);
  insert into public.recovery_returns (organization_id, ml_account_id, claim_row_id, claim_id, phase, claim_status)
  values (v_org_b, v_acc_b, v_claim_b, 33, 'waiting', 'opened');
  insert into public.recovery_findings (organization_id, ml_account_id, kind, dedupe_key, confidence)
  values (v_org_b, v_acc_b, 'return_reimbursed', 'return:33', 'high');

  -- Usuário A vê só a própria organização e não escreve.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_count from public.recovery_sync;
  if v_count <> 1 then raise exception 'FALHA: A vê % rodadas (esperado 1)', v_count; end if;
  select count(*) into v_count from public.recovery_scans;
  if v_count <> 1 then raise exception 'FALHA: A vê % Raio-X (esperado 1)', v_count; end if;
  select count(*) into v_count from public.recovery_returns;
  if v_count <> 1 then raise exception 'FALHA: A vê % devoluções (esperado 1)', v_count; end if;
  select count(*) into v_count from public.recovery_findings;
  if v_count <> 1 then raise exception 'FALHA: A vê % achados (esperado 1)', v_count; end if;
  select count(*) into v_count from public.recovery_actions;
  if v_count <> 1 then raise exception 'FALHA: A vê % revisões (esperado 1)', v_count; end if;

  v_failed := false;
  begin
    insert into public.recovery_actions (organization_id, ml_account_id, return_row_id, claim_row_id, claim_id, action,
                                         status, performed_by)
    values (v_org_a, v_acc_a, v_return_a, v_claim_a, 31, 'return_review_ok', 'success', v_user_a);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue registrar revisões'; end if;

  v_failed := false;
  begin
    update public.recovery_returns set phase = 'closed' where id = v_return_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar devoluções'; end if;

  v_failed := false;
  begin
    update public.recovery_findings set status = 'resolved' where ml_account_id = v_acc_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar achados'; end if;

  v_failed := false;
  begin
    perform public.claim_recovery_sync(10, 60, null);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue reservar rodadas'; end if;

  -- Visitante (anon) não lê nada.
  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    select count(*) into v_count from public.recovery_returns;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler devoluções'; end if;

  raise exception 'TESTES_RECUPERADOR_OK';
end;
$$;
