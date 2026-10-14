-- Testes da cobrança pela AbacatePay (Sessão 23): quem lê a assinatura, os pagamentos e as notificações.
-- Rodar no Supabase da v2 (é a produção: tudo acontece numa transação desfeita pelo erro final):
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/cobranca_abacatepay_rls.sql
-- Sucesso = erro "TESTES_COBRANCA_ABACATEPAY_OK".
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_user_c uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'abacate-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'abacate-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'abacate-c-' || v_user_c || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  -- C é membro comum da organização de A.
  insert into public.organization_members (organization_id, user_id, role) values (v_org_a, v_user_c, 'member');

  insert into public.billing_subscriptions (organization_id, subscription_id, status, plan, cycle, amount_cents, method,
                                            card_last4)
  values (v_org_a, 'subs_teste_a_' || left(v_org_a::text, 8), 'active', 'pro', 'monthly', 19700, 'CARD', '4242'),
         (v_org_b, 'subs_teste_b_' || left(v_org_b::text, 8), 'cancelled', 'starter', 'annual', 97000, 'CARD', null);
  insert into public.billing_checkouts (organization_id, plan, cycle, product_id, amount_cents, status, checkout_id)
  values (v_org_a, 'pro', 'monthly', 'prod_teste', 19700, 'paid', 'bill_teste_a_' || left(v_org_a::text, 8)),
         (v_org_b, 'starter', 'annual', 'prod_teste', 97000, 'pending', 'bill_teste_b_' || left(v_org_b::text, 8));
  insert into public.billing_events (id, event, organization_id, status)
  values ('log_teste_' || v_org_a, 'subscription.completed', v_org_a, 'processed');

  -- Regras das colunas.
  begin
    insert into public.billing_subscriptions (organization_id, subscription_id, status, plan, cycle, amount_cents)
    values (v_org_b, 'subs_outra', 'active', 'pro', 'weekly', 100);
    raise exception 'FALHA: ciclo inválido aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.billing_checkouts (organization_id, plan, cycle, product_id, amount_cents, checkout_id)
    values (v_org_b, 'pro', 'monthly', 'prod_teste', 19700, 'bill_teste_a_' || left(v_org_a::text, 8));
    raise exception 'FALHA: o mesmo checkout em duas linhas';
  exception when unique_violation then null;
  end;
  insert into public.billing_events (id, event) values ('log_repetido_' || v_org_a, 'subscription.renewed');
  begin
    insert into public.billing_events (id, event) values ('log_repetido_' || v_org_a, 'subscription.renewed');
    raise exception 'FALHA: a mesma entrega gravada duas vezes';
  exception when unique_violation then null;
  end;

  -- ------------------------------------------------------------------ dono da organização A (navegador)
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.billing_subscriptions;
  if v_count <> 1 then raise exception 'FALHA: A vê % assinaturas (esperado 1)', v_count; end if;
  select count(*) into v_count from public.billing_subscriptions where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'FALHA: A vê a assinatura de B'; end if;
  select count(*) into v_count from public.billing_checkouts;
  if v_count <> 1 then raise exception 'FALHA: A vê % pagamentos (esperado 1)', v_count; end if;

  v_failed := false;
  begin
    perform count(*) from public.billing_events;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente lê as notificações da AbacatePay'; end if;

  v_failed := false;
  begin
    update public.billing_subscriptions set plan = 'escala' where organization_id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente altera a própria assinatura'; end if;

  v_failed := false;
  begin
    insert into public.billing_checkouts (organization_id, plan, cycle, product_id, amount_cents)
    values (v_org_a, 'escala', 'monthly', 'prod_x', 1);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente cria pagamento direto no banco'; end if;

  v_failed := false;
  begin
    perform public.admin_billing_overview();
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente abre a cobrança do painel do administrador'; end if;

  v_failed := false;
  begin
    perform public.admin_organization_billing(v_org_a);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: cliente abre a ficha de cobrança do administrador'; end if;

  -- ------------------------------------------------------------------ membro comum (C) não vê a forma de pagamento
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_c, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.billing_subscriptions;
  if v_count <> 0 then raise exception 'FALHA: membro comum vê a assinatura (%)', v_count; end if;
  select count(*) into v_count from public.billing_checkouts;
  if v_count <> 0 then raise exception 'FALHA: membro comum vê os pagamentos (%)', v_count; end if;

  -- ------------------------------------------------------------------ visitante (anon)
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    perform count(*) from public.billing_subscriptions;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: visitante lê assinaturas'; end if;
  v_failed := false;
  begin
    perform public.admin_billing_overview();
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: visitante chama admin_billing_overview'; end if;

  raise exception 'TESTES_COBRANCA_ABACATEPAY_OK';
end;
$$;