-- Testes de RLS/função da tela Resultados. Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/resultados_rls.sql
-- Sucesso = erro "TESTES_RESULTADOS_OK". Tudo é desfeito no final.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_b uuid;
  v_result jsonb;
  v_failed boolean;
  v_now timestamptz := now();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'res-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'res-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;

  if (select analytics_minutes_per_answer from public.organizations where id = v_org_a) <> 3
     or (select analytics_hourly_cost from public.organizations where id = v_org_a) <> 20 then
    raise exception 'FALHA: premissas padrão erradas';
  end if;
  begin
    update public.organizations set analytics_minutes_per_answer = 0 where id = v_org_a;
    raise exception 'FALHA: premissa inválida aceita';
  exception when check_violation then null;
  end;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 920000001, 'A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 920000002, 'B')
    returning id into v_acc_b;

  -- Loja A, período atual: IA em 10 s, você em 2 h, uma em revisão sem rascunho (IA não sabia),
  -- uma importada ao conectar (respondida pela IA, mas fica fora do tempo de resposta).
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, item_id, item_title, question_text,
                                   status, answer_source, ai_model, ai_draft, question_created_at, created_at, answered_at)
  values
    (v_org_a, v_acc_a, 991, 'MLB1', 'Bike', 'Qual o prazo?', 'answered', 'ai', 'm', 'r',
     v_now - interval '1 day', v_now - interval '1 day' + interval '2 seconds', v_now - interval '1 day' + interval '10 seconds'),
    (v_org_a, v_acc_a, 992, 'MLB1', 'Bike', 'Tem garantia?', 'answered', 'manual', null, null,
     v_now - interval '2 days', v_now - interval '2 days', v_now - interval '2 days' + interval '2 hours'),
    (v_org_a, v_acc_a, 993, 'MLB2', 'Capacete', 'Serve 61 cm?', 'needs_review', null, 'm', null,
     v_now - interval '3 days', v_now - interval '3 days', null),
    (v_org_a, v_acc_a, 994, 'MLB1', 'Bike', 'Vem montada?', 'answered', 'ai', 'm', 'r',
     v_now - interval '5 days', v_now - interval '1 day', v_now - interval '1 day' + interval '9 seconds'),
    -- período anterior (8 a 14 dias atrás numa janela de 7 dias)
    (v_org_a, v_acc_a, 995, 'MLB2', 'Capacete', 'Tem na cor azul?', 'answered', 'manual', null, null,
     v_now - interval '10 days', v_now - interval '10 days', v_now - interval '10 days' + interval '1 hour');
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, question_text, status, answer_source,
                                   question_created_at, created_at, answered_at)
  values (v_org_b, v_acc_b, 996, 'Loja B', 'answered', 'ai', v_now - interval '1 day', v_now - interval '1 day', v_now);

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_result := public.analytics_overview(v_org_a, v_now - interval '7 days', v_now);
  if (v_result #>> '{current,total}')::int <> 4 or (v_result #>> '{current,ai}')::int <> 2
     or (v_result #>> '{current,manual}')::int <> 1 or (v_result #>> '{current,open}')::int <> 1 then
    raise exception 'FALHA: totais do período errados: %', v_result -> 'current';
  end if;
  if (v_result #>> '{previous,total}')::int <> 1 then
    raise exception 'FALHA: período anterior errado: %', v_result -> 'previous';
  end if;
  if (v_result #>> '{current,ai_timed}')::int <> 1 or (v_result #>> '{current,ai_median_seconds}')::numeric <> 10 then
    raise exception 'FALHA: tempo da IA deveria ignorar a pergunta importada: %', v_result -> 'current';
  end if;
  if (v_result #>> '{current,human_median_seconds}')::numeric <> 7200 then
    raise exception 'FALHA: tempo da pessoa errado: %', v_result -> 'current';
  end if;
  if v_result #>> '{items,0,item_id}' <> 'MLB1' or (v_result #>> '{items,0,total}')::int <> 3 then
    raise exception 'FALHA: anúncio com mais perguntas errado: %', v_result -> 'items';
  end if;
  if (v_result #>> '{causes,no_info}')::int <> 1 or (v_result #>> '{causes,ai_off}')::int <> 1 then
    raise exception 'FALHA: causas erradas: %', v_result -> 'causes';
  end if;
  if (v_result ->> 'lifetime_ai')::int <> 2 then
    raise exception 'FALHA: total histórico da IA errado: %', v_result -> 'lifetime_ai';
  end if;

  -- RLS: A pedindo os números da loja B não vê nada.
  v_result := public.analytics_overview(v_org_b, v_now - interval '7 days', v_now);
  if coalesce((v_result #>> '{current,total}')::int, 0) <> 0 or (v_result ->> 'lifetime_ai')::int <> 0 then
    raise exception 'FALHA: números de outra organização vazaram: %', v_result;
  end if;

  v_failed := false;
  begin
    update public.organizations set analytics_hourly_cost = 50 where id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar as premissas direto'; end if;

  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    perform public.analytics_overview(v_org_a, v_now - interval '7 days', v_now);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue chamar analytics_overview'; end if;

  raise exception 'TESTES_RESULTADOS_OK';
end;
$$;