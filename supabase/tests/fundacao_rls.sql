-- Testes de RLS da Fundação da v2. Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/fundacao_rls.sql
-- Tudo roda num bloco que termina com exceção: os dados de teste são sempre desfeitos.
-- Sucesso = erro "TESTES_RLS_OK". Qualquer outra mensagem é falha.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-a-' || v_user_a || '@teste.local', '', now(), '{}',
     '{"full_name":"Usuária A","terms_version":"2026-10-11"}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-b-' || v_user_b || '@teste.local', '', now(), '{}',
     '{"full_name":"Usuário B"}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  if v_org_a is null or v_org_b is null or v_org_a = v_org_b then
    raise exception 'FALHA: trigger não criou organizações separadas';
  end if;
  if (select terms_accepted_at from public.profiles where id = v_user_a) is null then
    raise exception 'FALHA: aceite dos termos não registrado';
  end if;
  if (select trial_ends_at from public.organizations where id = v_org_a) < now() + interval '6 days 23 hours' then
    raise exception 'FALHA: teste de 7 dias não definido';
  end if;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 900000001, 'LOJA_A');
  insert into public.ml_account_tokens (ml_account_id, access_token_enc, refresh_token_enc, expires_at)
    select id, 'x', 'y', now() from public.ml_accounts where ml_user_id = 900000001;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 900000002, 'LOJA_B');

  begin
    insert into public.ml_accounts (organization_id, ml_user_id) values (v_org_a, 900000003);
    raise exception 'FALHA: limite de contas ML não foi aplicado';
  exception when others then
    if sqlerrm <> 'ML_ACCOUNTS_LIMIT_REACHED' then raise; end if;
  end;

  begin
    insert into public.ml_accounts (organization_id, ml_user_id, status) values (v_org_b, 900000001, 'inactive');
    raise exception 'FALHA: a mesma conta ML entrou em duas organizações';
  exception when unique_violation then
    null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.organizations;
  if v_count <> 1 then raise exception 'FALHA: A vê % organizações (esperado 1)', v_count; end if;
  select count(*) into v_count from public.organizations where id = v_org_b;
  if v_count <> 0 then raise exception 'FALHA: A vê a organização de B'; end if;
  select count(*) into v_count from public.ml_accounts;
  if v_count <> 1 then raise exception 'FALHA: A vê % contas ML (esperado 1)', v_count; end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 1 then raise exception 'FALHA: A vê % perfis (esperado 1)', v_count; end if;
  select count(*) into v_count from public.organization_members;
  if v_count <> 1 then raise exception 'FALHA: A vê % membros (esperado 1)', v_count; end if;

  v_failed := false;
  begin
    perform 1 from public.ml_account_tokens;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue ler ml_account_tokens'; end if;

  v_failed := false;
  begin
    update public.profiles set is_platform_admin = true where id = v_user_a;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar o próprio perfil direto'; end if;

  v_failed := false;
  begin
    update public.organizations set billing_exempt = true where id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar a organização direto'; end if;

  v_failed := false;
  begin
    insert into public.ml_accounts (organization_id, ml_user_id) values (v_org_a, 900000009);
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue inserir conta ML direto'; end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_failed := false;
  begin
    perform 1 from public.organizations;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler organizations'; end if;

  raise exception 'TESTES_RLS_OK';
end;
$$;
