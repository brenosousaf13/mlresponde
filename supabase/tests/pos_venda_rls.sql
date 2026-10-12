-- Testes de RLS/funções do pós-venda. Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/pos_venda_rls.sql
-- Sucesso = erro "TESTES_POS_VENDA_OK". Tudo é desfeito no final.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_b uuid;
  v_conv_a uuid;
  v_conv_b uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'pv-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'pv-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  update public.organizations set plan = 'essencial' where id = v_org_a;

  if not public.plan_includes_after_sale('Essencial') or public.plan_includes_after_sale(null)
     or public.plan_includes_after_sale('starter') then
    raise exception 'FALHA: plan_includes_after_sale';
  end if;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 920000001, 'A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 920000002, 'B')
    returning id into v_acc_b;

  if (select after_sale_enabled from public.ml_accounts where id = v_acc_a) then
    raise exception 'FALHA: o agente de pós-venda deveria começar desligado';
  end if;

  insert into public.ml_conversations (organization_id, ml_account_id, pack_id) values (v_org_a, v_acc_a, '2000000000000001')
    returning id into v_conv_a;
  insert into public.ml_conversations (organization_id, ml_account_id, pack_id) values (v_org_b, v_acc_b, '2000000000000002')
    returning id into v_conv_b;
  insert into public.ml_conversation_messages (organization_id, conversation_id, ml_message_id, sender, source, text, sent_at)
    values (v_org_a, v_conv_a, 'm1', 'buyer', 'buyer', 'Já enviou?', now()),
           (v_org_b, v_conv_b, 'm2', 'buyer', 'buyer', 'Mensagem da loja B', now());
  insert into public.after_sale_examples (organization_id, ml_account_id, buyer_message, answer_text)
    values (v_org_a, v_acc_a, 'p', 'r'), (v_org_b, v_acc_b, 'p', 'r');

  begin
    insert into public.ml_conversations (organization_id, ml_account_id, pack_id) values (v_org_a, v_acc_a, '2000000000000001');
    raise exception 'FALHA: conversa duplicada aceita';
  exception when unique_violation then null;
  end;

  begin
    insert into public.ml_conversations (organization_id, ml_account_id, pack_id) values (v_org_a, v_acc_a, 'abc');
    raise exception 'FALHA: pack inválido aceito';
  exception when check_violation then null;
  end;

  begin
    insert into public.ml_conversation_messages (organization_id, conversation_id, ml_message_id, sender, source, text, sent_at)
      values (v_org_a, v_conv_a, 'm1', 'buyer', 'buyer', 'repetida', now());
    raise exception 'FALHA: mensagem duplicada aceita';
  exception when unique_violation then null;
  end;

  -- claim: reserva uma vez; com lock expirado volta para a fila
  select count(*) into v_count from public.claim_ml_conversation(v_conv_a);
  if v_count <> 1 then raise exception 'FALHA: claim não reservou'; end if;
  select count(*) into v_count from public.claim_ml_conversation(v_conv_a);
  if v_count <> 0 then raise exception 'FALHA: claim reservou duas vezes'; end if;
  update public.ml_conversations set locked_until = now() - interval '1 second' where id = v_conv_a;
  select count(*) into v_count from public.due_ml_conversations(50) d where d = v_conv_a;
  if v_count <> 1 then raise exception 'FALHA: lock expirado não voltou para a fila'; end if;

  -- usuário A (plano Essencial) vê só o que é dele
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.ml_conversations;
  if v_count <> 1 then raise exception 'FALHA: A vê % conversas (esperado 1)', v_count; end if;
  select count(*) into v_count from public.ml_conversation_messages;
  if v_count <> 1 then raise exception 'FALHA: A vê % mensagens (esperado 1)', v_count; end if;
  select count(*) into v_count from public.after_sale_examples;
  if v_count <> 1 then raise exception 'FALHA: A vê % respostas ensinadas (esperado 1)', v_count; end if;

  v_failed := false;
  begin
    update public.ml_conversations set status = 'answered' where id = v_conv_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar conversas'; end if;

  v_failed := false;
  begin
    insert into public.ml_conversation_messages (organization_id, conversation_id, ml_message_id, sender, source, text, sent_at)
      values (v_org_a, v_conv_a, 'x', 'seller', 'manual', 'x', now());
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue inserir mensagens'; end if;

  v_failed := false;
  begin
    perform 1 from public.claim_ml_conversation(v_conv_a);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue chamar claim_ml_conversation'; end if;

  v_failed := false;
  begin
    update public.ml_accounts set after_sale_enabled = true where id = v_acc_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue ligar o agente'; end if;

  -- usuário B (sem o plano) não vê nem as próprias conversas
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.ml_conversations;
  if v_count <> 0 then raise exception 'FALHA: organização sem o plano vê % conversas', v_count; end if;
  select count(*) into v_count from public.ml_conversation_messages;
  if v_count <> 0 then raise exception 'FALHA: organização sem o plano vê mensagens'; end if;
  select count(*) into v_count from public.after_sale_examples;
  if v_count <> 0 then raise exception 'FALHA: organização sem o plano vê respostas ensinadas'; end if;

  raise exception 'TESTES_POS_VENDA_OK';
end;
$$;
