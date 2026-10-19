-- Escudo de Reputação, etapa 2 (Sessão 29, 2026-10-19): reclamações com IA e ações (o vendedor aprova; nada sai sozinho).
-- Spec: docs/superpowers/specs/2026-10-19-escudo-reputacao-design.md
--
-- Aditiva:
--  * colunas novas em reputation_claims (tabela nova da etapa 1): detalhe, mensagens, venda, envio, IA e exclusão;
--  * 2 tabelas novas: reputation_claim_messages e reputation_claim_actions (histórico IMUTÁVEL: gatilho recusa UPDATE,
--    DELETE e TRUNCATE até para o service role; sem chave estrangeira, para nunca travar a exclusão de uma conta);
--  * CHECK de ai_usage_events.feature recriado com os mesmos valores + 'reputation_claim_analysis'.

-- ---------------------------------------------------------------------------------------------- reclamações

alter table public.reputation_claims
  add column claim_version text check (char_length(claim_version) <= 10),
  add column details_synced_at timestamptz,
  -- /claims/{id}/detail (só Claims 2.0): { title, description, problem, due_date, action_responsible }.
  add column detail jsonb check (detail is null or octet_length(detail::text) <= 4000),
  -- Texto do motivo (/claims/reasons/{id}).
  add column reason_detail text check (char_length(reason_detail) <= 300),
  -- O que cada parte espera: [{ player_role, expected_resolution, status, details }].
  add column expected_resolutions jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(expected_resolutions) = 'array' then jsonb_array_length(expected_resolutions) <= 20 else false end
  ),
  -- Venda (sem dados pessoais): { order_id, pack_id, date, total_amount, currency_id, items: [{ title, quantity, unit_price }] }.
  add column order_summary jsonb check (order_summary is null or octet_length(order_summary::text) <= 6000),
  -- Envio: { status, substatus, tracking_number, logistic_type } (sem endereço).
  add column shipping jsonb check (shipping is null or octet_length(shipping::text) <= 1000),
  add column buyer_nickname text check (char_length(buyer_nickname) <= 120),
  add column messages_count integer not null default 0 check (messages_count >= 0),
  add column last_message_at timestamptz,
  add column last_message_from text check (char_length(last_message_from) <= 40),
  -- Análise da IA: idle (nada a fazer), pending (na fila), processing, ready, failed, skipped (limite de 8).
  add column ai_status text not null default 'idle' check (ai_status in ('idle', 'pending', 'processing', 'ready', 'failed', 'skipped')),
  add column ai_result jsonb check (ai_result is null or octet_length(ai_result::text) <= 16000),
  add column ai_model text check (char_length(ai_model) <= 100),
  add column ai_analyzed_at timestamptz,
  add column ai_analyses integer not null default 0 check (ai_analyses >= 0),
  add column ai_error text check (char_length(ai_error) <= 300),
  add column ai_locked_until timestamptz,
  -- Assinatura do que a IA leu (muda = análise nova, até 8 por reclamação).
  add column ai_input_hash text check (char_length(ai_input_hash) <= 100),
  add column exclusion_requested_at timestamptz,
  add column exclusion_requested_by uuid references auth.users (id) on delete set null;

create index reputation_claims_details_idx on public.reputation_claims (ml_account_id, ml_updated_at desc)
  where details_synced_at is null or details_synced_at < ml_updated_at;
create index reputation_claims_ai_idx on public.reputation_claims (ai_status, updated_at) where ai_status = 'pending';

-- Mensagens da reclamação (comprador, vendedor e mediador). hash = identificador único do ML.
create table public.reputation_claim_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  claim_row_id uuid not null references public.reputation_claims (id) on delete cascade,
  hash text not null check (char_length(hash) between 1 and 200),
  sender_role text check (char_length(sender_role) <= 40),
  receiver_role text check (char_length(receiver_role) <= 40),
  message text not null default '' check (char_length(message) <= 5000),
  message_at timestamptz,
  stage text check (char_length(stage) <= 40),
  status text check (char_length(status) <= 40),
  moderation_status text check (char_length(moderation_status) <= 40),
  -- [{ filename, original_filename, size, type }], até 20.
  attachments jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(attachments) = 'array' then jsonb_array_length(attachments) <= 20 else false end
  ),
  created_at timestamptz not null default now(),
  unique (claim_row_id, hash)
);

create index reputation_claim_messages_claim_idx on public.reputation_claim_messages (claim_row_id, message_at);
create index reputation_claim_messages_org_idx on public.reputation_claim_messages (organization_id);

-- Tudo o que a maanu fez numa reclamação a pedido do vendedor (quem, quando, o quê e a resposta do ML). Imutável.
create table public.reputation_claim_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ml_account_id uuid not null,
  claim_row_id uuid not null,
  claim_id bigint not null check (claim_id > 0),
  action text not null check (action in (
    'send_message', 'refund', 'partial_refund', 'allow_return', 'open_dispute', 'exclusion_requested'
  )),
  receiver_role text check (receiver_role in ('complainant', 'mediator')),
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 12000),
  status text not null check (status in ('success', 'failed')),
  ml_status integer,
  ml_response jsonb check (ml_response is null or octet_length(ml_response::text) <= 8000),
  error text check (char_length(error) <= 500),
  performed_by uuid not null,
  performed_at timestamptz not null default now()
);

create index reputation_claim_actions_claim_idx on public.reputation_claim_actions (claim_row_id, performed_at desc);
create index reputation_claim_actions_org_idx on public.reputation_claim_actions (organization_id, performed_at desc);

create or replace function public.reputation_claim_actions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'REPUTATION_CLAIM_ACTIONS_IMMUTABLE';
end;
$$;

create trigger reputation_claim_actions_no_update before update or delete on public.reputation_claim_actions
  for each row execute function public.reputation_claim_actions_immutable();
create trigger reputation_claim_actions_no_truncate before truncate on public.reputation_claim_actions
  for each statement execute function public.reputation_claim_actions_immutable();

-- ---------------------------------------------------------------------------------------------- uso da IA

alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check check (feature in (
  'question_answer', 'question_suggestion', 'assistant_test',
  'after_sale_answer', 'after_sale_suggestion', 'after_sale_test',
  'key_check',
  'listing_improvement',
  'reputation_claim_analysis'
));

-- ---------------------------------------------------------------------------------------------- permissões

revoke execute on function public.reputation_claim_actions_immutable() from public, anon, authenticated;

alter table public.reputation_claim_messages enable row level security;
alter table public.reputation_claim_actions enable row level security;

revoke all on table public.reputation_claim_messages, public.reputation_claim_actions from anon, authenticated;
grant select on table public.reputation_claim_messages, public.reputation_claim_actions to authenticated;
grant select, insert, update, delete on table public.reputation_claim_messages to service_role;
grant select, insert on table public.reputation_claim_actions to service_role;

create policy "Membros veem as mensagens das reclamações da organização" on public.reputation_claim_messages
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem o histórico de ações das reclamações da organização" on public.reputation_claim_actions
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
