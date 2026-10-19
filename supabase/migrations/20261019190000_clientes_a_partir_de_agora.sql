-- Clientes contados só a partir de agora (Sessão 28b, 2026-10-19; pedido do Breno: "são muitas vendas, vai lotar de
-- informação e a importação vai levar muito tempo; contabilizar apenas a partir de agora e parar as importações").
--
-- Sem importação do histórico: cada conta conta as compras a partir de ml_customer_sync.tracking_since (agora, para as
-- contas que já existiam; a data da conexão, para as novas). Toda gravação passa por ingest_ml_orders, que ignora
-- vendas feitas antes dessa data (inclusive vendas antigas avisadas pelo ML quando mudam de situação).
--
-- Aditiva no schema (1 coluna nova com default; funções com a mesma assinatura). Apaga as vendas e os clientes que a
-- importação de 12 meses trouxe (cópia de dados do Mercado Livre; nenhum cliente tinha observação). Aprovado pelo Breno.
-- As colunas da importação (import_since, window_*, orders_imported, import_*_at) ficam sem uso (não foram apagadas).

alter table public.ml_customer_sync
  add column if not exists tracking_since timestamptz not null default now();

comment on column public.ml_customer_sync.tracking_since is
  'Início da contagem de clientes da conta: só vendas feitas a partir daqui entram (ingest_ml_orders).';
comment on column public.ml_customer_sync.import_since is 'Sem uso desde a Sessão 28b (não há importação do histórico).';

-- Conta nova: começa a contar na conexão, sem importação.
create or replace function public.ml_accounts_create_customer_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ml_customer_sync (ml_account_id, organization_id, status, tracking_since)
  values (new.id, new.organization_id, 'done', now())
  on conflict (ml_account_id) do nothing;
  return new;
end;
$$;

-- Contas que já existem: importação encerrada e contagem a partir de agora.
update public.ml_customer_sync
   set status = 'done',
       tracking_since = now(),
       orders_imported = 0,
       import_since = null,
       window_from = null,
       window_to = null,
       window_offset = 0,
       import_started_at = null,
       import_finished_at = null,
       last_polled_at = null,
       last_error = null,
       attempts = 0,
       next_attempt_at = now(),
       locked_until = null;

-- Grava um lote de vendas de uma conta (conferência ou notificação orders_v2). Mesmas regras de antes, mais uma: só
-- vendas feitas a partir de tracking_since da conta. Devolve quantas vendas foram gravadas ou atualizadas.
create or replace function public.ingest_ml_orders(p_ml_account_id uuid, p_orders jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_since timestamptz;
  v_orders jsonb;
  v_changed integer := 0;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then
    raise exception 'INGEST_INVALID_PAYLOAD';
  end if;
  if jsonb_array_length(p_orders) > 200 then
    raise exception 'INGEST_TOO_MANY_ORDERS';
  end if;

  select a.organization_id into v_organization_id from public.ml_accounts a where a.id = p_ml_account_id;
  if v_organization_id is null then
    raise exception 'ML_ACCOUNT_NOT_FOUND';
  end if;

  -- Início da contagem (conta sem a linha de sincronização ganha a linha agora).
  insert into public.ml_customer_sync (ml_account_id, organization_id, status, tracking_since)
  values (p_ml_account_id, v_organization_id, 'done', now())
  on conflict (ml_account_id) do nothing;
  select s.tracking_since into v_since from public.ml_customer_sync s where s.ml_account_id = p_ml_account_id;

  -- Só as vendas feitas a partir do início da contagem (venda sem data também fica de fora).
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_orders
    from public.ml_orders_payload(p_orders) r
   where r.ordered_at >= v_since;
  if jsonb_array_length(v_orders) = 0 then
    return 0;
  end if;

  -- 1) Clientes do lote. Do lote, vale o apelido/nome mais recente que veio preenchido; last_order_at aqui é só a data
  --    mais nova do lote (o passo 3 recalcula com as compras válidas). Apelido e nome só mudam com venda tão ou mais nova.
  insert into public.ml_customers as c
    (organization_id, ml_account_id, buyer_id, nickname, first_name, last_name, last_order_at)
  select v_organization_id, p_ml_account_id, r.buyer_id,
         (array_agg(r.buyer_nickname order by r.ordered_at desc nulls last) filter (where r.buyer_nickname is not null))[1],
         (array_agg(r.buyer_first_name order by r.ordered_at desc nulls last) filter (where r.buyer_first_name is not null))[1],
         (array_agg(r.buyer_last_name order by r.ordered_at desc nulls last) filter (where r.buyer_last_name is not null))[1],
         max(r.ordered_at)
    from public.ml_orders_payload(v_orders) r
   group by r.buyer_id
  on conflict (ml_account_id, buyer_id) do update
     set nickname = case
           when c.nickname is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.nickname, c.nickname) else c.nickname end,
         first_name = case
           when c.first_name is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.first_name, c.first_name) else c.first_name end,
         last_name = case
           when c.last_name is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.last_name, c.last_name) else c.last_name end;

  -- 2) Vendas. Só atualiza quando a versão recebida é tão ou mais nova que a gravada.
  insert into public.ml_orders as o
    (organization_id, ml_account_id, customer_id, ml_order_id, pack_id, buyer_id, status, ordered_at, closed_at,
     ml_last_updated, total_amount, paid_amount, currency_id, shipment_id, mediations_count, items)
  select v_organization_id, p_ml_account_id, c.id, r.ml_order_id, r.pack_id, r.buyer_id, r.status, r.ordered_at,
         r.closed_at, r.ml_last_updated, r.total_amount, r.paid_amount, r.currency_id, r.shipment_id,
         r.mediations_count, r.items
    from public.ml_orders_payload(v_orders) r
    join public.ml_customers c on c.ml_account_id = p_ml_account_id and c.buyer_id = r.buyer_id
  on conflict (ml_account_id, ml_order_id) do update
     set customer_id = excluded.customer_id,
         pack_id = excluded.pack_id,
         buyer_id = excluded.buyer_id,
         status = excluded.status,
         ordered_at = coalesce(excluded.ordered_at, o.ordered_at),
         closed_at = coalesce(excluded.closed_at, o.closed_at),
         ml_last_updated = excluded.ml_last_updated,
         total_amount = excluded.total_amount,
         paid_amount = excluded.paid_amount,
         currency_id = coalesce(excluded.currency_id, o.currency_id),
         shipment_id = coalesce(excluded.shipment_id, o.shipment_id),
         mediations_count = excluded.mediations_count,
         items = excluded.items
   where coalesce(excluded.ml_last_updated, '-infinity'::timestamptz)
         >= coalesce(o.ml_last_updated, '-infinity'::timestamptz);
  get diagnostics v_changed = row_count;

  -- 3) Números dos clientes do lote (compras contam por pack; só as situações válidas) e a venda de onde vem a cidade.
  with affected as (
    select c.id
      from public.ml_customers c
     where c.ml_account_id = p_ml_account_id
       and c.buyer_id in (select r.buyer_id from public.ml_orders_payload(v_orders) r)
  ),
  stats as (
    select a.id as customer_id,
           count(distinct coalesce(o.pack_id, o.ml_order_id)) filter (where public.ml_order_is_purchase(o.status)) as purchases,
           coalesce(sum(o.total_amount) filter (where public.ml_order_is_purchase(o.status)), 0) as total,
           min(o.ordered_at) filter (where public.ml_order_is_purchase(o.status)) as first_at,
           max(o.ordered_at) filter (where public.ml_order_is_purchase(o.status)) as last_at,
           (array_agg(o.currency_id order by o.ordered_at desc nulls last)
              filter (where public.ml_order_is_purchase(o.status) and o.currency_id is not null))[1] as currency,
           (array_agg(o.ml_order_id order by o.ordered_at desc nulls last, o.ml_order_id desc)
              filter (where public.ml_order_is_purchase(o.status) and o.shipment_id is not null))[1] as location_order
      from affected a
      left join public.ml_orders o on o.customer_id = a.id
     group by a.id
  )
  update public.ml_customers c
     set purchases_count = s.purchases,
         total_spent = s.total,
         first_order_at = s.first_at,
         last_order_at = s.last_at,
         currency_id = coalesce(s.currency, c.currency_id),
         location_ml_order_id = s.location_order,
         location_pending = case
           when s.location_order is null then false
           when s.location_order is distinct from c.location_ml_order_id then true
           else c.location_pending
         end
    from stats s
   where c.id = s.customer_id;

  return v_changed;
end;
$$;

revoke execute on function public.ml_accounts_create_customer_sync() from public, anon, authenticated;
revoke execute on function public.ingest_ml_orders(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_ml_orders(uuid, jsonb) to service_role;

-- Limpeza: vendas de antes do início da contagem (as da importação de 12 meses) e os clientes que ficaram sem venda.
delete from public.ml_orders o
 using public.ml_customer_sync s
 where s.ml_account_id = o.ml_account_id
   and (o.ordered_at is null or o.ordered_at < s.tracking_since);

update public.ml_customers c
   set purchases_count = 0, total_spent = 0, first_order_at = null, last_order_at = null,
       location_pending = false, location_ml_order_id = null
 where not exists (select 1 from public.ml_orders o where o.customer_id = c.id);

-- Cliente com observação escrita pela equipe não é apagado (só fica fora da lista até comprar de novo).
delete from public.ml_customers c
 where c.notes = ''
   and not exists (select 1 from public.ml_orders o where o.customer_id = c.id);
