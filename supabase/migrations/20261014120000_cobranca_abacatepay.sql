-- Cobrança pela AbacatePay (Sessão 23, 2026-10-14): assinatura pelo app, webhooks e painel do administrador.
-- Spec: docs/superpowers/specs/2026-10-14-cobranca-abacatepay-design.md
--
-- Aditiva e retrocompatível: 3 tabelas novas e 2 funções novas do painel do administrador. Nada existente muda.
--  * billing_subscriptions: a assinatura atual de cada organização na AbacatePay (1 por organização);
--  * billing_checkouts: cada página de pagamento criada pelo app (o id vai como externalId para a AbacatePay);
--  * billing_events: cada notificação (webhook) recebida, para não processar a mesma duas vezes e para o painel.
-- O que vale para o app continua em organizations (plan, subscription_status, billing_cycle, current_period_end,
-- monthly_price): o servidor atualiza essas colunas a partir dos eventos.
-- Privilégios padrão negados (CEREBRO §6.1f): todo acesso abaixo é concedido de forma explícita.

-- ---------------------------------------------------------------------------------------------- assinatura atual

create table public.billing_subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  provider text not null default 'abacatepay' check (provider in ('abacatepay')),
  subscription_id text not null unique check (subscription_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  customer_id text check (char_length(customer_id) <= 100),
  checkout_id text check (char_length(checkout_id) <= 100),
  status text not null check (status in ('active', 'cancelled')),
  plan text not null check (plan ~ '^[a-z0-9_-]{1,40}$'),
  cycle text not null check (cycle in ('monthly', 'annual')),
  amount_cents integer not null check (amount_cents >= 0),
  method text check (method in ('CARD', 'PIX')),
  card_brand text check (char_length(card_brand) <= 40),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  -- Troca para um plano mais barato: vale a partir da próxima cobrança (até lá continua o plano atual).
  scheduled_plan text check (scheduled_plan is null or scheduled_plan ~ '^[a-z0-9_-]{1,40}$'),
  scheduled_at timestamptz,
  last_payment_at timestamptz,
  last_receipt_url text check (char_length(last_receipt_url) <= 500),
  -- Cobrança recusada: a AbacatePay tenta de novo sozinha; o app só avisa (o acesso continua até ela cancelar).
  payment_failed_at timestamptz,
  payment_failures integer not null default 0 check (payment_failures between 0 and 100),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  -- updatedAt da assinatura na AbacatePay no último evento aplicado (eventos mais antigos chegando depois são ignorados).
  provider_updated_at timestamptz,
  dev_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_subscriptions is
  'Assinatura atual de cada organização na AbacatePay. Só o servidor grava (webhooks e ações do app).';

create trigger billing_subscriptions_set_updated_at before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- páginas de pagamento

create table public.billing_checkouts (
  -- Vai como externalId do checkout de assinatura: liga o pagamento à organização.
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan text not null check (plan ~ '^[a-z0-9_-]{1,40}$'),
  cycle text not null check (cycle in ('monthly', 'annual')),
  product_id text not null check (char_length(product_id) between 1 and 100),
  amount_cents integer not null check (amount_cents >= 0),
  checkout_id text unique check (char_length(checkout_id) <= 100),
  url text check (char_length(url) <= 500),
  status text not null default 'creating' check (status in ('creating', 'pending', 'paid', 'failed', 'cancelled')),
  subscription_id text check (char_length(subscription_id) <= 100),
  customer_id text check (char_length(customer_id) <= 100),
  dev_mode boolean,
  error text check (char_length(error) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_checkouts is
  'Páginas de pagamento (checkout de assinatura da AbacatePay) criadas pelo app. Só o servidor grava.';

create index billing_checkouts_org_created_idx on public.billing_checkouts (organization_id, created_at desc);
create index billing_checkouts_subscription_idx on public.billing_checkouts (subscription_id)
  where subscription_id is not null;

create trigger billing_checkouts_set_updated_at before update on public.billing_checkouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- notificações recebidas

create table public.billing_events (
  -- Id da entrega (log_... ou o cabeçalho webhook-id): as novas tentativas da AbacatePay repetem o mesmo id.
  id text primary key check (char_length(id) between 1 and 200),
  provider text not null default 'abacatepay' check (provider in ('abacatepay')),
  event text not null check (char_length(event) between 1 and 80),
  dev_mode boolean not null default false,
  organization_id uuid references public.organizations (id) on delete set null,
  subscription_id text check (char_length(subscription_id) <= 100),
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  note text check (char_length(note) <= 500),
  attempts integer not null default 1 check (attempts >= 1),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 200000),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.billing_events is
  'Webhooks da AbacatePay recebidos (idempotência e histórico do painel). Nenhum acesso pelo navegador.';

create index billing_events_received_idx on public.billing_events (received_at desc);
create index billing_events_org_idx on public.billing_events (organization_id, received_at desc)
  where organization_id is not null;

-- ---------------------------------------------------------------------------------------------- acesso

alter table public.billing_subscriptions enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_events enable row level security;

revoke all on table public.billing_subscriptions from anon, authenticated;
revoke all on table public.billing_checkouts from anon, authenticated;
revoke all on table public.billing_events from anon, authenticated;

-- Navegador: só leitura, e só o dono/administrador da organização (forma de pagamento é dado do titular).
grant select on table public.billing_subscriptions to authenticated;
grant select on table public.billing_checkouts to authenticated;
grant all on table public.billing_subscriptions to service_role;
grant all on table public.billing_checkouts to service_role;
grant all on table public.billing_events to service_role;

create policy "Dono e administradores veem a assinatura" on public.billing_subscriptions
  for select to authenticated
  using (organization_id in (select public.current_user_managed_organization_ids()));

create policy "Dono e administradores veem os pagamentos" on public.billing_checkouts
  for select to authenticated
  using (organization_id in (select public.current_user_managed_organization_ids()));

-- ---------------------------------------------------------------------------------------------- painel do administrador

-- Tela Cobrança: números das assinaturas, as mais recentes, os pagamentos e as notificações.
create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'active', count(*) filter (where s.status = 'active' and not s.dev_mode),
        'cancelled', count(*) filter (where s.status = 'cancelled' and not s.dev_mode),
        'payment_failed', count(*) filter (where s.status = 'active' and s.payment_failed_at is not null and not s.dev_mode),
        'scheduled', count(*) filter (where s.status = 'active' and s.scheduled_plan is not null and not s.dev_mode),
        'test', count(*) filter (where s.dev_mode),
        'mrr_cents', coalesce(round(sum(
          case when s.status = 'active' and not s.dev_mode
            then case when s.cycle = 'annual' then s.amount_cents / 12.0 else s.amount_cents end
          end
        )), 0)
      )
      from public.billing_subscriptions s
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(x order by x.updated_at desc), '[]'::jsonb)
      from (
        select s.organization_id, o.name as organization_name, s.subscription_id, s.customer_id, s.status, s.plan,
               s.cycle, s.amount_cents, s.method, s.card_brand, s.card_last4, s.scheduled_plan, s.last_payment_at,
               s.payment_failed_at, s.payment_failures, s.cancelled_at, s.cancel_reason, s.dev_mode, s.updated_at,
               o.current_period_end
          from public.billing_subscriptions s
          join public.organizations o on o.id = s.organization_id
         order by s.updated_at desc
         limit 100
      ) x
    ),
    'checkouts', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select c.id, c.organization_id, o.name as organization_name, c.plan, c.cycle, c.amount_cents, c.status,
               c.checkout_id, c.subscription_id, c.dev_mode, c.error, c.created_at, c.paid_at
          from public.billing_checkouts c
          join public.organizations o on o.id = c.organization_id
         order by c.created_at desc
         limit 50
      ) x
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x.received_at desc), '[]'::jsonb)
      from (
        select e.id, e.event, e.status, e.note, e.dev_mode, e.attempts, e.received_at, e.processed_at,
               e.organization_id, o.name as organization_name, e.subscription_id
          from public.billing_events e
          left join public.organizations o on o.id = e.organization_id
         order by e.received_at desc
         limit 50
      ) x
    )
  );
end;
$$;

-- Ficha do cliente: assinatura na AbacatePay, últimos pagamentos e notificações da organização.
create or replace function public.admin_organization_billing(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return jsonb_build_object(
    'subscription', (select to_jsonb(s) from public.billing_subscriptions s where s.organization_id = p_organization_id),
    'checkouts', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select c.id, c.plan, c.cycle, c.amount_cents, c.status, c.checkout_id, c.subscription_id, c.dev_mode, c.error,
               c.created_at, c.paid_at
          from public.billing_checkouts c
         where c.organization_id = p_organization_id
         order by c.created_at desc
         limit 10
      ) x
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x.received_at desc), '[]'::jsonb)
      from (
        select e.id, e.event, e.status, e.note, e.dev_mode, e.received_at, e.subscription_id
          from public.billing_events e
         where e.organization_id = p_organization_id
         order by e.received_at desc
         limit 20
      ) x
    )
  );
end;
$$;

revoke execute on function public.admin_billing_overview() from public, anon;
revoke execute on function public.admin_organization_billing(uuid) from public, anon;
grant execute on function public.admin_billing_overview() to authenticated;
grant execute on function public.admin_organization_billing(uuid) to authenticated;