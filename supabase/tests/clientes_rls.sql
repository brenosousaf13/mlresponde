-- Testes de RLS e funções da aba Clientes. Rodar no Supabase da v2:
--   npx supabase db query --linked -f supabase/tests/clientes_rls.sql
-- Sucesso = erro "TESTES_CLIENTES_OK". Tudo é desfeito no final (o erro desfaz a transação inteira).
do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_org_a uuid;
  v_org_b uuid;
  v_acc_a uuid;
  v_acc_b uuid;
  v_count integer;
  v_changed integer;
  v_failed boolean;
  v_customer record;
  v_order record;
  v_sync record;
  v_overview jsonb;
  v_batch jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cli-a-' || v_user_a || '@teste.local', '', now(), '{}', '{}', now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cli-b-' || v_user_b || '@teste.local', '', now(), '{}', '{}', now(), now());

  select organization_id into v_org_a from public.organization_members where user_id = v_user_a;
  select organization_id into v_org_b from public.organization_members where user_id = v_user_b;
  -- Aba Clientes vale para todos os planos (A no Starter, B no teste grátis).
  update public.organizations set plan = 'starter', subscription_status = 'active' where id = v_org_a;

  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_a, 930000001, 'LOJA A')
    returning id into v_acc_a;
  insert into public.ml_accounts (organization_id, ml_user_id, nickname) values (v_org_b, 930000002, 'LOJA B')
    returning id into v_acc_b;

  -- Conta nova ganha a linha de sincronização, sem importação, contando a partir da conexão.
  select * into v_sync from public.ml_customer_sync where ml_account_id = v_acc_a;
  if v_sync is null or v_sync.status <> 'done' or v_sync.organization_id <> v_org_a or v_sync.tracking_since <> now() then
    raise exception 'FALHA: conta nova sem sincronização contando a partir de agora';
  end if;

  -- Venda feita antes do início da contagem é ignorada.
  v_changed := public.ingest_ml_orders(v_acc_a, jsonb_build_array(
    jsonb_build_object('ml_order_id', 999, 'buyer_id', 599, 'status', 'paid', 'ordered_at', now() - interval '1 day',
      'ml_last_updated', now(), 'total_amount', 10, 'items', '[]'::jsonb)));
  select count(*) into v_count from public.ml_customers where ml_account_id = v_acc_a;
  if v_changed <> 0 or v_count <> 0 then raise exception 'FALHA: venda de antes do início da contagem foi gravada'; end if;

  -- Daqui para baixo as vendas de teste são de 2026: a contagem das duas contas começa em 1/1/2026.
  update public.ml_customer_sync set tracking_since = '2026-01-01T00:00:00Z' where ml_account_id in (v_acc_a, v_acc_b);

  -- Lote da loja A:
  --  * comprador 501: pack 9001 com 2 vendas pagas (100 + 50) e 1 venda cancelada (30) depois;
  --  * comprador 502: 2 compras pagas, sem envio;
  --  * comprador 503: só uma venda cancelada;
  --  * linha sem comprador (descartada).
  v_batch := jsonb_build_array(
    jsonb_build_object('ml_order_id', 1001, 'pack_id', 9001, 'buyer_id', 501, 'buyer_nickname', 'COMPRADOR501',
      'buyer_first_name', 'Maria', 'buyer_last_name', 'Silva', 'status', 'paid',
      'ordered_at', '2026-09-01T10:00:00Z', 'ml_last_updated', '2026-09-01T12:00:00Z',
      'total_amount', 100, 'paid_amount', 100, 'currency_id', 'BRL', 'shipment_id', 7001, 'mediations_count', 0,
      'items', jsonb_build_array(jsonb_build_object('id', 'MLB1', 'title', 'Calça', 'quantity', 1, 'unit_price', 100))),
    jsonb_build_object('ml_order_id', 1002, 'pack_id', 9001, 'buyer_id', 501, 'buyer_nickname', 'COMPRADOR501',
      'status', 'paid', 'ordered_at', '2026-09-01T10:00:00Z', 'ml_last_updated', '2026-09-01T12:00:00Z',
      'total_amount', 50, 'currency_id', 'BRL', 'shipment_id', 7001, 'items', '[]'::jsonb),
    jsonb_build_object('ml_order_id', 1003, 'buyer_id', 501, 'status', 'cancelled',
      'ordered_at', '2026-09-10T10:00:00Z', 'ml_last_updated', '2026-09-10T12:00:00Z', 'total_amount', 30,
      'currency_id', 'BRL', 'shipment_id', 7003, 'items', '[]'::jsonb),
    jsonb_build_object('ml_order_id', 1004, 'buyer_id', 502, 'buyer_nickname', 'COMPRADOR502', 'status', 'paid',
      'ordered_at', '2026-08-01T10:00:00Z', 'ml_last_updated', '2026-08-01T10:00:00Z', 'total_amount', 20,
      'currency_id', 'BRL', 'items', '[]'::jsonb),
    jsonb_build_object('ml_order_id', 1005, 'buyer_id', 502, 'status', 'partially_refunded',
      'ordered_at', '2026-10-01T10:00:00Z', 'ml_last_updated', '2026-10-02T10:00:00Z', 'total_amount', 40,
      'currency_id', 'BRL', 'items', '[]'::jsonb),
    jsonb_build_object('ml_order_id', 1006, 'buyer_id', 503, 'buyer_nickname', 'COMPRADOR503', 'status', 'cancelled',
      'ordered_at', '2026-10-05T10:00:00Z', 'ml_last_updated', '2026-10-05T10:00:00Z', 'total_amount', 80,
      'items', '[]'::jsonb),
    jsonb_build_object('ml_order_id', 1007, 'status', 'paid', 'total_amount', 10, 'items', '[]'::jsonb)
  );

  v_changed := public.ingest_ml_orders(v_acc_a, v_batch);
  if v_changed <> 6 then raise exception 'FALHA: ingest gravou % vendas (esperado 6)', v_changed; end if;

  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 501;
  if v_customer.purchases_count <> 1 or v_customer.total_spent <> 150 then
    raise exception 'FALHA: 501 com % compras e R$ % (esperado 1 compra pelo pack e R$ 150)',
      v_customer.purchases_count, v_customer.total_spent;
  end if;
  if v_customer.full_name <> 'Maria Silva' or v_customer.nickname <> 'COMPRADOR501' then
    raise exception 'FALHA: nome do 501 (%, %)', v_customer.full_name, v_customer.nickname;
  end if;
  if not v_customer.location_pending or v_customer.location_ml_order_id <> 1002 then
    raise exception 'FALHA: cidade do 501 deveria vir da venda 1002 (pendente %, venda %)',
      v_customer.location_pending, v_customer.location_ml_order_id;
  end if;
  if v_customer.last_order_at <> '2026-09-01T10:00:00Z'::timestamptz then
    raise exception 'FALHA: venda cancelada contou como última compra do 501';
  end if;

  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 502;
  if v_customer.purchases_count <> 2 or v_customer.total_spent <> 60 or v_customer.location_pending then
    raise exception 'FALHA: 502 (% compras, R$ %, pendente %)',
      v_customer.purchases_count, v_customer.total_spent, v_customer.location_pending;
  end if;
  if v_customer.first_order_at <> '2026-08-01T10:00:00Z'::timestamptz
     or v_customer.last_order_at <> '2026-10-01T10:00:00Z'::timestamptz then
    raise exception 'FALHA: datas do 502';
  end if;

  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 503;
  if v_customer.purchases_count <> 0 or v_customer.total_spent <> 0 or v_customer.last_order_at is not null then
    raise exception 'FALHA: venda cancelada contou para o 503';
  end if;

  select count(*) into v_count from public.ml_orders where ml_account_id = v_acc_a;
  if v_count <> 6 then raise exception 'FALHA: % vendas gravadas (esperado 6)', v_count; end if;

  -- Idempotente: o mesmo lote de novo não muda os números.
  perform public.ingest_ml_orders(v_acc_a, v_batch);
  select count(*) into v_count from public.ml_orders where ml_account_id = v_acc_a;
  if v_count <> 6 then raise exception 'FALHA: lote repetido duplicou vendas'; end if;
  select count(*) into v_count from public.ml_customers where ml_account_id = v_acc_a;
  if v_count <> 3 then raise exception 'FALHA: lote repetido duplicou clientes'; end if;
  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 501;
  if v_customer.purchases_count <> 1 or v_customer.total_spent <> 150 then
    raise exception 'FALHA: lote repetido mudou os números do 501';
  end if;

  -- Dado mais velho não sobrescreve: a venda 1001 "cancelada" com last_updated antigo é ignorada.
  v_changed := public.ingest_ml_orders(v_acc_a, jsonb_build_array(
    jsonb_build_object('ml_order_id', 1001, 'pack_id', 9001, 'buyer_id', 501, 'status', 'cancelled',
      'ordered_at', '2026-09-01T10:00:00Z', 'ml_last_updated', '2026-09-01T11:00:00Z', 'total_amount', 100,
      'items', '[]'::jsonb)));
  if v_changed <> 0 then raise exception 'FALHA: versão mais velha da venda foi gravada'; end if;
  select * into v_order from public.ml_orders where ml_account_id = v_acc_a and ml_order_id = 1001;
  if v_order.status <> 'paid' then raise exception 'FALHA: versão mais velha mudou a situação'; end if;

  -- Versão mais nova vale: 1001 cancelada → o pack continua (1002 paga), total cai para 50.
  v_changed := public.ingest_ml_orders(v_acc_a, jsonb_build_array(
    jsonb_build_object('ml_order_id', 1001, 'pack_id', 9001, 'buyer_id', 501, 'status', 'cancelled',
      'ordered_at', '2026-09-01T10:00:00Z', 'ml_last_updated', '2026-09-03T11:00:00Z', 'total_amount', 100,
      'items', '[]'::jsonb)));
  if v_changed <> 1 then raise exception 'FALHA: versão mais nova da venda não foi gravada'; end if;
  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 501;
  if v_customer.purchases_count <> 1 or v_customer.total_spent <> 50 then
    raise exception 'FALHA: 501 depois do cancelamento (% compras, R$ %)', v_customer.purchases_count, v_customer.total_spent;
  end if;

  -- Cidade já lida (pendente = falso) + compra nova com envio → volta a ficar pendente, da venda nova.
  update public.ml_customers set location_pending = false, city = 'Belo Horizonte', state = 'MG'
   where ml_account_id = v_acc_a and buyer_id = 501;
  perform public.ingest_ml_orders(v_acc_a, jsonb_build_array(
    jsonb_build_object('ml_order_id', 1008, 'buyer_id', 501, 'buyer_nickname', 'NOVOAPELIDO', 'status', 'paid',
      'ordered_at', '2026-10-15T10:00:00Z', 'ml_last_updated', '2026-10-15T10:00:00Z', 'total_amount', 70,
      'shipment_id', 7008, 'items', '[]'::jsonb)));
  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 501;
  if not v_customer.location_pending or v_customer.location_ml_order_id <> 1008 or v_customer.city <> 'Belo Horizonte' then
    raise exception 'FALHA: compra nova não pediu a cidade de novo (pendente %, venda %)',
      v_customer.location_pending, v_customer.location_ml_order_id;
  end if;
  if v_customer.nickname <> 'NOVOAPELIDO' or v_customer.purchases_count <> 2 or v_customer.total_spent <> 120 then
    raise exception 'FALHA: 501 depois da compra nova (%, % compras, R$ %)',
      v_customer.nickname, v_customer.purchases_count, v_customer.total_spent;
  end if;

  -- Venda antiga (importação) não troca o apelido pelo antigo.
  perform public.ingest_ml_orders(v_acc_a, jsonb_build_array(
    jsonb_build_object('ml_order_id', 1009, 'buyer_id', 501, 'buyer_nickname', 'APELIDOVELHO', 'status', 'paid',
      'ordered_at', '2026-01-15T10:00:00Z', 'ml_last_updated', '2026-01-15T10:00:00Z', 'total_amount', 10,
      'items', '[]'::jsonb)));
  select * into v_customer from public.ml_customers where ml_account_id = v_acc_a and buyer_id = 501;
  if v_customer.nickname <> 'NOVOAPELIDO' or v_customer.first_order_at <> '2026-01-15T10:00:00Z'::timestamptz then
    raise exception 'FALHA: venda antiga trocou o apelido (%) ou não virou a primeira compra', v_customer.nickname;
  end if;

  -- Lote da loja B (outra organização).
  perform public.ingest_ml_orders(v_acc_b, jsonb_build_array(
    jsonb_build_object('ml_order_id', 2001, 'buyer_id', 501, 'status', 'paid', 'ordered_at', '2026-10-01T10:00:00Z',
      'ml_last_updated', '2026-10-01T10:00:00Z', 'total_amount', 99, 'items', '[]'::jsonb)));

  begin
    perform public.ingest_ml_orders(v_acc_a, '{}'::jsonb);
    raise exception 'FALHA: lote que não é lista aceito';
  exception when raise_exception then
    if sqlerrm <> 'INGEST_INVALID_PAYLOAD' then raise; end if;
  end;

  -- Sem importação: nenhuma conta entra na fila de importação.
  select count(*) into v_count from public.claim_customer_sync('import', 100) c
   where c.ml_account_id in (v_acc_a, v_acc_b);
  if v_count <> 0 then raise exception 'FALHA: conta nova entrou na fila de importação'; end if;

  -- Conferência (uma vez só); conta desconectada e organização bloqueada ficam de fora.
  update public.ml_accounts set status = 'disconnected' where id = v_acc_b;
  select count(*) into v_count from public.claim_customer_sync('poll', 100) c where c.ml_account_id = v_acc_a;
  if v_count <> 1 then raise exception 'FALHA: conferência não reservou a conta A'; end if;
  select count(*) into v_count from public.claim_customer_sync('poll', 100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conferência reservou a mesma conta duas vezes'; end if;
  update public.ml_customer_sync set locked_until = null where ml_account_id = v_acc_a;
  select count(*) into v_count from public.claim_customer_sync('poll', 100) c where c.ml_account_id = v_acc_b;
  if v_count <> 0 then raise exception 'FALHA: conta desconectada foi reservada'; end if;
  update public.ml_customer_sync set locked_until = null, last_polled_at = now() - interval '5 minutes'
   where ml_account_id = v_acc_a;
  select count(*) into v_count from public.claim_customer_sync('poll', 100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: conferência antes de 10 minutos'; end if;
  update public.ml_customer_sync set locked_until = null, last_polled_at = null where ml_account_id = v_acc_a;
  update public.organizations set subscription_status = 'trialing', trial_ends_at = now() - interval '1 day'
   where id = v_org_a;
  select count(*) into v_count from public.claim_customer_sync('poll', 100) c where c.ml_account_id = v_acc_a;
  if v_count <> 0 then raise exception 'FALHA: organização bloqueada foi reservada'; end if;
  update public.organizations set subscription_status = 'active' where id = v_org_a;
  update public.ml_accounts set status = 'active' where id = v_acc_b;

  -- Usuário A vê só a própria organização.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.ml_customers;
  if v_count <> 3 then raise exception 'FALHA: A vê % clientes (esperado 3)', v_count; end if;
  select count(*) into v_count from public.ml_orders;
  if v_count <> 8 then raise exception 'FALHA: A vê % vendas (esperado 8)', v_count; end if;
  select count(*) into v_count from public.ml_customer_sync;
  if v_count <> 1 then raise exception 'FALHA: A vê % sincronizações (esperado 1)', v_count; end if;

  v_overview := public.customers_overview(v_org_a);
  if (v_overview ->> 'customers')::integer <> 2 or (v_overview ->> 'returning')::integer <> 2
     or (v_overview ->> 'total_spent')::numeric <> 190 then
    raise exception 'FALHA: customers_overview de A = %', v_overview;
  end if;
  v_overview := public.customers_overview(v_org_b);
  if (v_overview ->> 'customers')::integer <> 0 then
    raise exception 'FALHA: A vê os números da organização B (%)', v_overview;
  end if;

  v_failed := false;
  begin
    update public.ml_customers set notes = 'x' where ml_account_id = v_acc_a;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue alterar clientes'; end if;

  v_failed := false;
  begin
    insert into public.ml_orders (organization_id, ml_account_id, customer_id, ml_order_id, buyer_id, status)
    select v_org_a, v_acc_a, id, 99999, 501, 'paid' from public.ml_customers limit 1;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue inserir vendas'; end if;

  v_failed := false;
  begin
    perform public.ingest_ml_orders(v_acc_a, '[]'::jsonb);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue chamar ingest_ml_orders'; end if;

  v_failed := false;
  begin
    perform 1 from public.claim_customer_sync('import', 1);
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: authenticated consegue chamar claim_customer_sync'; end if;

  -- Usuário B vê só o cliente da loja B.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.ml_customers;
  if v_count <> 1 then raise exception 'FALHA: B vê % clientes (esperado 1)', v_count; end if;

  -- Visitante (anon) não lê nada.
  perform set_config('role', 'anon', true);
  v_failed := false;
  begin
    select count(*) into v_count from public.ml_customers;
    v_failed := true;
  exception when insufficient_privilege then null;
  end;
  if v_failed then raise exception 'FALHA: anon consegue ler clientes'; end if;

  raise exception 'TESTES_CLIENTES_OK';
end;
$$;
