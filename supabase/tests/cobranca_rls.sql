-- Testes dos dados de cobrança (CPF/CNPJ + endereço). Rodar só no Supabase de TESTES:
--   npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f supabase/tests/cobranca_rls.sql
-- Tudo roda num bloco que termina com exceção: os dados de teste são sempre desfeitos.
-- Sucesso = erro "TESTES_COBRANCA_OK". Qualquer outra mensagem é falha.
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_user_c uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_org_c uuid;
  v_count integer;
  v_failed boolean;
begin
  -- Validação dos documentos (mesma regra do TypeScript em lib/billing/documents.ts).
  if not public.is_valid_tax_document('cpf', '52998224725') then raise exception 'FALHA: CPF válido recusado'; end if;
  if not public.is_valid_tax_document('cpf', '11144477735') then raise exception 'FALHA: CPF válido recusado (2)'; end if;
  if public.is_valid_tax_document('cpf', '52998224724') then raise exception 'FALHA: CPF com dígito errado aceito'; end if;
  if public.is_valid_tax_document('cpf', '11111111111') then raise exception 'FALHA: CPF repetido aceito'; end if;
  if not public.is_valid_tax_document('cnpj', '11222333000181') then raise exception 'FALHA: CNPJ numérico recusado'; end if;
  if not public.is_valid_tax_document('cnpj', '12ABC34501DE35') then raise exception 'FALHA: CNPJ alfanumérico recusado'; end if;
  if public.is_valid_tax_document('cnpj', '12ABC34501DE36') then raise exception 'FALHA: CNPJ alfanumérico errado aceito'; end if;
  if public.is_valid_tax_document('cnpj', '00000000000000') then raise exception 'FALHA: CNPJ zerado aceito'; end if;
  if public.is_valid_tax_document('cpf', '11222333000181') then raise exception 'FALHA: CNPJ aceito como CPF'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cob-a-' || v_user_a || '@teste.local', '', now(), '{}', '{"full_name":"Dona A"}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cob-b-' || v_user_b || '@teste.local', '', now(), '{}', '{"full_name":"Dono B"}', now(), now()),
    (v_user_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cob-c-' || v_user_c || '@teste.local', '', now(), '{}', '{"full_name":"Membro C"}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  select organization_id into v_org_c from public.organization_members where user_id = v_user_c;
  -- C também é membro comum da organização de A.
  insert into public.organization_members (organization_id, user_id, role) values (v_org_a, v_user_c, 'member');

  insert into public.billing_profiles (organization_id, document_type, document, legal_name, postal_code, street,
                                       address_number, district, city, state, registered_by)
  values
    (v_org_a, 'cpf', '52998224725', 'Dona A da Silva', '01310100', 'Avenida Paulista', '1000', 'Bela Vista',
     'São Paulo', 'SP', v_user_a),
    (v_org_b, 'cnpj', '12ABC34501DE35', 'Empresa B Ltda', '20040002', 'Rua da Assembleia', '10', 'Centro',
     'Rio de Janeiro', 'RJ', v_user_b);

  -- Documento inválido é barrado pelo banco.
  begin
    insert into public.billing_profiles (organization_id, document_type, document, legal_name, postal_code, street,
                                         address_number, district, city, state)
    values (v_org_c, 'cpf', '52998224724', 'Membro C', '01310100', 'Rua X', '1', 'Centro', 'São Paulo', 'SP');
    raise exception 'FALHA: CPF inválido gravado';
  exception when check_violation then
    null;
  end;

  -- Um documento = uma conta.
  begin
    insert into public.billing_profiles (organization_id, document_type, document, legal_name, postal_code, street,
                                         address_number, district, city, state)
    values (v_org_c, 'cpf', '52998224725', 'Membro C', '01310100', 'Rua X', '1', 'Centro', 'São Paulo', 'SP');
    raise exception 'FALHA: o mesmo CPF entrou em duas contas';
  exception when unique_violation then
    if sqlerrm not like '%billing_profiles_document_key%' then raise; end if;
  end;

  -- Endereço e nome podem mudar; o documento não (nem pelo service role).
  update public.billing_profiles set street = 'Avenida Brigadeiro Faria Lima', legal_name = 'Dona A Souza'
  where organization_id = v_org_a;

  begin
    update public.billing_profiles set document = '11144477735' where organization_id = v_org_a;
    raise exception 'FALHA: CPF alterado depois de cadastrado';
  exception when others then
    if sqlerrm <> 'BILLING_DOCUMENT_LOCKED' then raise; end if;
  end;

  begin
    update public.billing_profiles set document_type = 'cnpj', document = '11222333000181'
    where organization_id = v_org_a;
    raise exception 'FALHA: tipo do documento alterado depois de cadastrado';
  exception when others then
    if sqlerrm <> 'BILLING_DOCUMENT_LOCKED' then raise; end if;
  end;

  begin
    update public.billing_profiles set organization_id = v_org_c where organization_id = v_org_a;
    raise exception 'FALHA: dados de cobrança mudaram de organização';
  exception when others then
    if sqlerrm <> 'BILLING_PROFILE_ORGANIZATION_LOCKED' then raise; end if;
  end;

  -- Correção pelo suporte (SQL explícito) continua possível.
  perform set_config('app.allow_billing_document_change', 'on', true);
  update public.billing_profiles set document = '11144477735' where organization_id = v_org_a;
  perform set_config('app.allow_billing_document_change', '', true);
  if (select document from public.billing_profiles where organization_id = v_org_a) <> '11144477735' then
    raise exception 'FALHA: correção do suporte não aplicada';
  end if;

  -- Dona A (logada): vê só os próprios dados e não consegue escrever.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.billing_profiles;
  if v_count <> 1 then raise exception 'FALHA: A vê % dados de cobrança (esperado 1)', v_count; end if;
  select count(*) into v_count from public.billing_profiles where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'FALHA: A vê os dados de cobrança de B'; end if;

  v_failed := false;
  begin
    update public.billing_profiles set street = 'Rua Hackeada' where organization_id = v_org_a;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar dados de cobrança direto'; end if;

  v_failed := false;
  begin
    insert into public.billing_profiles (organization_id, document_type, document, legal_name, postal_code, street,
                                         address_number, district, city, state)
    values (v_org_a, 'cpf', '52998224725', 'X', '01310100', 'Rua X', '1', 'Centro', 'São Paulo', 'SP');
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue inserir dados de cobrança direto'; end if;

  -- Membro comum C (da organização de A) não vê o CPF da dona.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_c, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.billing_profiles;
  if v_count <> 0 then raise exception 'FALHA: membro comum vê % dados de cobrança (esperado 0)', v_count; end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_failed := false;
  begin
    perform 1 from public.billing_profiles;
    v_failed := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler billing_profiles'; end if;

  raise exception 'TESTES_COBRANCA_OK';
end;
$$;
