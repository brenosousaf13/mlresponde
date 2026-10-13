-- Testes dos planos (Sessão 20): plano em vigor, limite de contas, contagem de respostas e Melhorias de anúncio.
-- Rodar no Supabase da v2 (é a produção: tudo acontece numa transação desfeita pelo erro final):
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/planos_rls.sql
-- Sucesso = erro "TESTES_PLANOS_OK".
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a1 uuid;
  v_acc_a2 uuid;
  v_acc_a3 uuid;
  v_acc_a4 uuid;
  v_acc_b uuid;
  v_conv_a uuid;
  v_count integer;
  v_text text;
  v_failed boolean;
  v_month timestamptz := date_trunc('month', now());
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'planos-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'planos-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;

  -- ------------------------------------------------------------------ plano em vigor
  select public.organization_plan_id(o.plan, o.subscription_status, o.trial_ends_at) into v_text
    from public.organizations o where o.id = v_org_a;
  if v_text is distinct from 'trial' then raise exception 'FALHA: organização nova deveria estar no plano trial (%)', v_text; end if;
  if public.organization_plan_id(null, 'trialing', now() - interval '1 minute') is not null then
    raise exception 'FALHA: teste vencido não pode contar como trial';
  end if;
  if public.organization_plan_id(' PRO ', 'active', now()) <> 'pro' then raise exception 'FALHA: plano cadastrado'; end if;
  if public.plan_ml_accounts_limit('starter') <> 1 or public.plan_ml_accounts_limit('pro') <> 3
     or public.plan_ml_accounts_limit('escala') <> 10 or public.plan_ml_accounts_limit('ouro') is not null then
    raise exception 'FALHA: plan_ml_accounts_limit';
  end if;
  if (select ml_accounts_limit from public.organizations where id = v_org_a) <> 1 then
    raise exception 'FALHA: o teste grátis começa com 1 conta';
  end if;

  -- ------------------------------------------------------------------ trocar o plano ajusta o limite de contas
  update public.organizations set plan = 'pro' where id = v_org_a;
  if (select ml_accounts_limit from public.organizations where id = v_org_a) <> 3 then
    raise exception 'FALHA: Pro deveria ter 3 contas';
  end if;
  update public.organizations set plan = 'escala', ml_accounts_limit = 7 where id = v_org_a;
  if (select ml_accounts_limit from public.organizations where id = v_org_a) <> 7 then
    raise exception 'FALHA: limite escolhido junto com o plano deveria valer';
  end if;
  update public.organizations set plan = 'escala' where id = v_org_a;
  update public.organizations set plan = 'pro' where id = v_org_a;
  update public.organizations set plan = 'escala' where id = v_org_a;
  if (select ml_accounts_limit from public.organizations where id = v_org_a) <> 10 then
    raise exception 'FALHA: Escala deveria ter 10 contas';
  end if;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname, created_at)
    values (v_org_a, 930000001, 'A1', now() - interval '4 days') returning id into v_acc_a1;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname, created_at)
    values (v_org_a, 930000002, 'A2', now() - interval '3 days') returning id into v_acc_a2;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname, created_at)
    values (v_org_a, 930000003, 'A3', now() - interval '2 days') returning id into v_acc_a3;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname, created_at)
    values (v_org_a, 930000004, 'A4', now() - interval '1 day') returning id into v_acc_a4;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 930000005, 'B')
    returning id into v_acc_b;

  -- Escala → Pro (3 contas): a mais nova fica inativa; nada é apagado.
  update public.organizations set plan = 'pro' where id = v_org_a;
  select count(*) into v_count from public.ml_accounts where organization_id = v_org_a and status = 'active';
  if v_count <> 3 then raise exception 'FALHA: deveriam sobrar 3 contas ativas (%).', v_count; end if;
  if (select status from public.ml_accounts where id = v_acc_a4) <> 'inactive' then
    raise exception 'FALHA: a conta mais nova deveria ficar inativa';
  end if;
  select count(*) into v_count from public.ml_accounts where organization_id = v_org_a;
  if v_count <> 4 then raise exception 'FALHA: nenhuma conta pode ser apagada'; end if;

  begin
    update public.ml_accounts set status = 'active' where id = v_acc_a4;
    raise exception 'FALHA: reativar acima do limite deveria falhar';
  exception when others then
    if sqlerrm not like '%ML_ACCOUNTS_LIMIT_REACHED%' then raise; end if;
  end;

  update public.organizations set plan = 'pro' where id = v_org_a;

  -- ------------------------------------------------------------------ respostas automáticas no período
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, item_id, question_text, status,
                                   answer_source, answered_at, created_at)
  values
    (v_org_a, v_acc_a1, 9930000000001, 'MLB9930000001', 'Tem azul?', 'answered', 'ai', now(), now()),
    (v_org_a, v_acc_a1, 9930000000002, 'MLB9930000001', 'Qual a medida?', 'answered', 'ai', now(), now()),
    (v_org_a, v_acc_a1, 9930000000003, 'MLB9930000001', 'Serve em 110v?', 'answered', 'manual', now(), now()),
    (v_org_a, v_acc_a1, 9930000000004, 'MLB9930000002', 'Tem garantia?', 'needs_review', null, null, now()),
    (v_org_a, v_acc_a1, 9930000000005, 'MLB9930000002', 'Pergunta antiga', 'answered', 'ai',
     v_month - interval '2 days', v_month - interval '2 days'),
    (v_org_b, v_acc_b, 9930000000006, 'MLB9930000003', 'Pergunta da B', 'answered', 'ai', now(), now());

  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, item_id, question_text, status, review_reason)
    values (v_org_a, v_acc_a1, 9930000000007, 'MLB9930000002', 'Limite', 'needs_review', 'answers_limit');

  insert into public.ml_conversations (organization_id, ml_account_id, pack_id) values (v_org_a, v_acc_a1, '2930000000000001')
    returning id into v_conv_a;
  insert into public.ml_conversation_messages (organization_id, conversation_id, ml_message_id, sender, source, text, sent_at)
    values (v_org_a, v_conv_a, 'pm1', 'buyer', 'buyer', 'Chegou?', now()),
           (v_org_a, v_conv_a, 'pm2', 'seller', 'ai', 'Está a caminho', now()),
           (v_org_a, v_conv_a, 'pm3', 'seller', 'manual', 'Obrigado', now());
  update public.ml_conversations set review_reason = 'answers_limit', status = 'needs_review' where id = v_conv_a;

  v_count := public.organization_ai_answers(v_org_a, v_month, v_month + interval '1 month');
  if v_count <> 3 then raise exception 'FALHA: respostas automáticas do mês = % (esperado 3)', v_count; end if;

  -- ------------------------------------------------------------------ melhorias de anúncio
  insert into public.listing_improvements (organization_id, ml_account_id, item_id, status, result)
    values (v_org_a, v_acc_a1, 'MLB9930000001', 'ready', '{"summary": "ok", "suggestions": []}'),
           (v_org_b, v_acc_b, 'MLB9930000003', 'ready', '{}');
  insert into public.listing_improvements (organization_id, ml_account_id, item_id) values (v_org_a, v_acc_a1, 'MLB9930000002');
  begin
    insert into public.listing_improvements (organization_id, ml_account_id, item_id) values (v_org_a, v_acc_a1, 'MLB9930000002');
    raise exception 'FALHA: duas análises em andamento do mesmo anúncio';
  exception when unique_violation then null;
  end;
  begin
    insert into public.listing_improvements (organization_id, ml_account_id, item_id) values (v_org_a, v_acc_a1, 'abc');
    raise exception 'FALHA: anúncio inválido aceito';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ usuário A (navegador)
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.listing_improvements;
  if v_count <> 2 then raise exception 'FALHA: A vê % análises (esperado 2)', v_count; end if;

  v_count := public.organization_ai_answers(v_org_a, v_month, v_month + interval '1 month');
  if v_count <> 3 then raise exception 'FALHA: A conta % respostas (esperado 3)', v_count; end if;
  v_count := public.organization_ai_answers(v_org_b, v_month, v_month + interval '1 month');
  if v_count <> 0 then raise exception 'FALHA: A conta respostas da organização B (%)', v_count; end if;

  select count(*) into v_count from public.listing_question_ranking(v_org_a, now() - interval '90 days');
  if v_count <> 2 then raise exception 'FALHA: ranking de A com % anúncios (esperado 2)', v_count; end if;
  select r.questions into v_count from public.listing_question_ranking(v_org_a, now() - interval '90 days') r
   where r.item_id = 'MLB9930000001';
  if v_count <> 3 then raise exception 'FALHA: anúncio com % perguntas (esperado 3)', v_count; end if;
  select count(*) into v_count from public.listing_question_ranking(v_org_b, now() - interval '90 days');
  if v_count <> 0 then raise exception 'FALHA: A vê o ranking da organização B'; end if;

  -- A (plano Pro) vê o pós-venda.
  select count(*) into v_count from public.ml_conversations;
  if v_count <> 1 then raise exception 'FALHA: organização Pro deveria ver a conversa'; end if;

  v_failed := false;
  begin
    insert into public.listing_improvements (organization_id, ml_account_id, item_id) values (v_org_a, v_acc_a1, 'MLB9930000009');
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue criar análise'; end if;

  v_failed := false;
  begin
    update public.listing_improvements set done_suggestions = '{1}' where organization_id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar análise'; end if;

  v_failed := false;
  begin
    perform public.admin_organization_usage(v_org_a, v_month, v_month + interval '1 month');
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente consegue chamar admin_organization_usage'; end if;

  v_failed := false;
  begin
    perform public.admin_update_organization(v_org_a, '{"monthly_answers_limit": 99999}'::jsonb);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente consegue mudar o próprio limite'; end if;

  -- ------------------------------------------------------------------ usuário B: teste grátis vê o pós-venda
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.current_user_after_sale_organization_ids() x where x = v_org_b;
  if v_count <> 1 then raise exception 'FALHA: teste grátis deveria incluir o pós-venda'; end if;
  select count(*) into v_count from public.listing_improvements;
  if v_count <> 1 then raise exception 'FALHA: B vê % análises (esperado 1)', v_count; end if;


  raise exception 'TESTES_PLANOS_OK';
end;
$$;
