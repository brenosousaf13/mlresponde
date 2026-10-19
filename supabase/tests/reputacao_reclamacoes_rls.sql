-- Testes da etapa 2 do Escudo de Reputação (reclamações: mensagens, histórico de ações imutável e uso da IA).
--   npx supabase db query --linked -f supabase/tests/reputacao_reclamacoes_rls.sql
-- Sucesso = erro "TESTES_REPUTACAO_RECLAMACOES_OK". Tudo é desfeito no final.
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
  v_action uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'repc-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'repc-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());
  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 941000001, 'REPC A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 941000002, 'REPC B')
    returning id into v_acc_b;

  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status, ai_status)
  values (v_org_a, v_acc_a, 21, 'mediations', 'opened', 'pending') returning id into v_claim_a;
  insert into public.reputation_claims (organization_id, ml_account_id, claim_id, type, status)
  values (v_org_b, v_acc_b, 22, 'mediations', 'opened') returning id into v_claim_b;
  insert into public.reputation_claim_messages (organization_id, ml_account_id, claim_row_id, hash, sender_role, message)
  values (v_org_a, v_acc_a, v_claim_a, 'h1', 'complainant', 'Chegou quebrado'),
         (v_org_b, v_acc_b, v_claim_b, 'h2', 'complainant', 'Não chegou');
  insert into public.reputation_claim_actions (organization_id, ml_account_id, claim_row_id, claim_id, action,
                                               receiver_role, status, performed_by)
  values (v_org_a, v_acc_a, v_claim_a, 21, 'send_message', 'complainant', 'success', v_user_a) returning id into v_action;
  insert into public.reputation_claim_actions (organization_id, ml_account_id, claim_row_id, claim_id, action, status, performed_by)
  values (v_org_b, v_acc_b, v_claim_b, 22, 'refund', 'failed', v_user_b);

  -- Mesma mensagem (hash) na mesma reclamação não duplica.
  v_failed := false;
  begin
    insert into public.reputation_claim_messages (organization_id, ml_account_id, claim_row_id, hash)
    values (v_org_a, v_acc_a, v_claim_a, 'h1');
    v_failed := true;
  exception when unique_violation then null;
  end;
  if v_failed then raise exception 'FALHA: mensagem repetida aceita'; end if;

  -- Histórico de ações é imutável até para o dono do banco.
  v_failed := false;
  begin
    update public.reputation_claim_actions set status = 'failed' where id = v_action;
    v_failed := true;
  exception when raise_exception then
    if sqlerrm <> 'REPUTATION_CLAIM_ACTIONS_IMMUTABLE' then raise; end if;
  end;
  if v_failed then raise exception 'FALHA: histórico de ações alterado'; end if;
  v_failed := false;
  begin
    delete from public.reputation_claim_actions where id = v_action;
    v_failed := true;
  exception when raise_exception then
    if sqlerrm <> 'REPUTATION_CLAIM_ACTIONS_IMMUTABLE' then raise; end if;
  end;
  if v_failed then raise exception 'FALHA: histórico de ações apagado'; end if;

  -- Uso da IA aceita a análise de reclamação (e continua recusando valores desconhecidos).
  insert into public.ai_usage_events (organization_id, ml_account_id, feature, model)
  values (v_org_a, v_acc_a, 'reputation_claim_analysis', 'teste');
  v_failed := false;
  begin
    insert into public.ai_usage_events (organization_id, feature, model) values (v_org_a, 'qualquer_coisa', 'teste');
    v_failed := true;
  exception when check_violation then null;
  end;
  if v_failed then raise exception 'FALHA: função de IA desconhecida aceita'; end if;

  -- Apagar a conta do ML apaga as mensagens (cascata) e não é travado pelo histórico (sem chave estrangeira).
  delete from public.ml_accounts where id = v_acc_b;
  select count(*) into v_count from public.reputation_claim_messages where claim_row_id = v_claim_b;
  if v_count <> 0 then raise exception 'FALHA: mensagens ficaram depois de apagar a conta'; end if;
  select count(*) into v_count from public.reputation_claim_actions where claim_row_id = v_claim_b;
  if v_count <> 1 then raise exception 'FALHA: histórico de ações sumiu com a conta'; end if;

  -- Usuário A vê só a própria organização e não escreve.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_count from public.reputation_claim_messages;
  if v_count <> 1 then raise exception 'FALHA: A vê % mensagens (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_claim_actions;
  if v_count <> 1 then raise exception 'FALHA: A vê % ações (esperado 1)', v_count; end if;
  select count(*) into v_count from public.reputation_claims where ai_status = 'pending';
  if v_count <> 1 then raise exception 'FALHA: A não vê a própria reclamação'; end if;

  v_failed := false;
  begin
    insert into public.reputation_claim_actions (organization_id, ml_account_id, claim_row_id, claim_id, action, status, performed_by)
    values (v_org_a, v_acc_a, v_claim_a, 21, 'refund', 'success', v_user_a);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue registrar ações'; end if;

  v_failed := false;
  begin
    update public.reputation_claims set ai_status = 'ready' where id = v_claim_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar reclamações'; end if;

  -- Visitante (anon) não lê nada.
  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    select count(*) into v_count from public.reputation_claim_messages;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler mensagens'; end if;

  raise exception 'TESTES_REPUTACAO_RECLAMACOES_OK';
end;
$$;
