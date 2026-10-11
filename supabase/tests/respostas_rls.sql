-- Testes de RLS/funções do sub-projeto 2. Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/respostas_rls.sql
-- Sucesso = erro "TESTES_RESPOSTAS_OK". Tudo é desfeito no final.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_b uuid;
  v_q_a uuid;
  v_count integer;
  v_failed boolean;
  v_stats record;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'resp-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'resp-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 910000001, 'A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 910000002, 'B')
    returning id into v_acc_b;

  if (select auto_reply_enabled from public.ml_accounts where id = v_acc_a) then
    raise exception 'FALHA: respostas automáticas deveriam começar desligadas';
  end if;

  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, question_text)
    values (v_org_a, v_acc_a, 1, 'Tem na cor azul?') returning id into v_q_a;
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, question_text, status, answer_source,
                                   answered_at, question_created_at)
    values (v_org_a, v_acc_a, 2, 'Serve no modelo X?', 'answered', 'ai', now(), now() - interval '30 seconds');
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, question_text, status, review_reason)
    values (v_org_a, v_acc_a, 3, 'Faz desconto?', 'needs_review', 'ai_escalated');
  insert into public.ml_questions (organization_id, ml_account_id, ml_question_id, question_text)
    values (v_org_b, v_acc_b, 4, 'Pergunta da loja B');
  insert into public.ai_examples (organization_id, ml_account_id, question_text, answer_text)
    values (v_org_b, v_acc_b, 'p', 'r');
  insert into public.item_blacklist (organization_id, ml_account_id, item_id) values (v_org_b, v_acc_b, 'MLB1234567');

  begin
    insert into public.ml_questions (organization_id, ml_account_id, ml_question_id) values (v_org_a, v_acc_a, 1);
    raise exception 'FALHA: pergunta duplicada aceita';
  exception when unique_violation then null;
  end;

  begin
    insert into public.item_blacklist (organization_id, ml_account_id, item_id) values (v_org_a, v_acc_a, 'abc');
    raise exception 'FALHA: id de anúncio inválido aceito';
  exception when check_violation then null;
  end;

  -- claim: primeira vez reserva; segunda não (já está processando com lock válido)
  select count(*) into v_count from public.claim_ml_question(v_q_a);
  if v_count <> 1 then raise exception 'FALHA: claim não reservou'; end if;
  select count(*) into v_count from public.claim_ml_question(v_q_a);
  if v_count <> 0 then raise exception 'FALHA: claim reservou duas vezes'; end if;
  if (select attempts from public.ml_questions where id = v_q_a) <> 1 then
    raise exception 'FALHA: tentativas não contadas';
  end if;
  update public.ml_questions set locked_until = now() - interval '1 second' where id = v_q_a;
  select count(*) into v_count from public.due_ml_questions(10) d where d = v_q_a;
  if v_count <> 1 then raise exception 'FALHA: lock expirado não voltou para a fila'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.ml_questions;
  if v_count <> 3 then raise exception 'FALHA: A vê % perguntas (esperado 3)', v_count; end if;
  select count(*) into v_count from public.ai_examples;
  if v_count <> 0 then raise exception 'FALHA: A vê respostas ensinadas de B'; end if;
  select count(*) into v_count from public.item_blacklist;
  if v_count <> 0 then raise exception 'FALHA: A vê blacklist de B'; end if;

  select * into v_stats from public.question_stats(v_org_a, now() - interval '7 days');
  if v_stats.total <> 3 or v_stats.answered_ai <> 1 or v_stats.awaiting_review <> 1 then
    raise exception 'FALHA: question_stats incorreto (% / % / %)', v_stats.total, v_stats.answered_ai, v_stats.awaiting_review;
  end if;
  if v_stats.avg_ai_seconds is null or v_stats.avg_ai_seconds < 25 then
    raise exception 'FALHA: tempo médio da IA incorreto (%)', v_stats.avg_ai_seconds;
  end if;
  select * into v_stats from public.question_stats(v_org_b, now() - interval '7 days');
  if v_stats.total <> 0 then raise exception 'FALHA: stats de outra organização vazaram'; end if;

  v_failed := false;
  begin
    perform 1 from public.claim_ml_question(v_q_a);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue chamar claim_ml_question'; end if;

  v_failed := false;
  begin
    update public.ml_questions set status = 'answered' where id = v_q_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar perguntas'; end if;

  v_failed := false;
  begin
    update public.ml_accounts set auto_reply_enabled = true where id = v_acc_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar configurações da conta'; end if;

  raise exception 'TESTES_RESPOSTAS_OK';
end;
$$;
