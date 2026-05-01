-- Polymarket Builder-fee reconciliation backbone.
--
-- Official Builder-fee evidence is the source of truth for reward accounting.
-- Local routed-order audits are matching evidence only; they must not create
-- confirmed rewards on their own.

create table if not exists public.polymarket_builder_fee_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  imported_count integer not null default 0 check (imported_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  disputed_count integer not null default 0 check (disputed_count >= 0),
  voided_count integer not null default 0 check (voided_count >= 0),
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists polymarket_builder_fee_reconciliation_runs_started_idx
  on public.polymarket_builder_fee_reconciliation_runs (started_at desc);

create table if not exists public.polymarket_builder_fee_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_fee_id text,
  deterministic_import_key text not null,
  external_order_id text,
  external_trade_id text,
  clob_order_id text,
  market_external_id text,
  condition_id text,
  token_id text,
  trader_wallet text,
  builder_code text,
  side text not null default 'unknown' check (side in ('maker', 'taker', 'unknown')),
  notional_amount_atoms bigint not null default 0 check (notional_amount_atoms >= 0),
  fee_amount_atoms bigint not null default 0,
  fee_asset text not null default 'USDC',
  fee_bps integer check (fee_bps is null or (fee_bps >= 0 and fee_bps <= 10000)),
  matched_at timestamptz,
  imported_at timestamptz not null default now(),
  raw_evidence_json jsonb not null,
  status text not null default 'imported' check (status in ('imported', 'matched', 'confirmed', 'disputed', 'void')),
  dispute_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'disputed' and dispute_reason is not null)
    or status <> 'disputed'
  )
);

create unique index if not exists polymarket_builder_fee_imports_deterministic_key_idx
  on public.polymarket_builder_fee_imports (deterministic_import_key);

create unique index if not exists polymarket_builder_fee_imports_external_fee_id_idx
  on public.polymarket_builder_fee_imports (source, external_fee_id)
  where external_fee_id is not null;

create unique index if not exists polymarket_builder_fee_imports_trade_fee_idx
  on public.polymarket_builder_fee_imports (source, external_trade_id, builder_code, fee_amount_atoms)
  where external_trade_id is not null
    and builder_code is not null
    and status <> 'void';

create index if not exists polymarket_builder_fee_imports_status_idx
  on public.polymarket_builder_fee_imports (status, imported_at desc);

create index if not exists polymarket_builder_fee_imports_match_keys_idx
  on public.polymarket_builder_fee_imports (external_order_id, clob_order_id, external_trade_id, token_id)
  where status in ('imported', 'matched');

alter table public.polymarket_routed_order_audits
  add column if not exists clob_order_id text,
  add column if not exists external_trade_id text,
  add column if not exists trader_wallet text,
  add column if not exists builder_code text,
  add column if not exists condition_id text;

create index if not exists polymarket_routed_order_audits_clob_order_idx
  on public.polymarket_routed_order_audits (clob_order_id)
  where clob_order_id is not null;

create index if not exists polymarket_routed_order_audits_external_trade_idx
  on public.polymarket_routed_order_audits (external_trade_id)
  where external_trade_id is not null;

create index if not exists polymarket_routed_order_audits_builder_wallet_idx
  on public.polymarket_routed_order_audits (builder_code, lower(trader_wallet), created_at desc)
  where builder_code is not null
    and trader_wallet is not null;

alter table public.builder_trade_attributions
  add column if not exists source_builder_fee_import_id uuid,
  add column if not exists source_evidence_key text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'builder_trade_attributions_fee_import_fk'
       and conrelid = 'public.builder_trade_attributions'::regclass
  ) then
    alter table public.builder_trade_attributions
      add constraint builder_trade_attributions_fee_import_fk
      foreign key (source_builder_fee_import_id)
      references public.polymarket_builder_fee_imports (id)
      on delete restrict
      not valid;
  end if;
end $$;

alter table public.builder_trade_attributions
  validate constraint builder_trade_attributions_fee_import_fk;

create unique index if not exists builder_trade_attributions_fee_import_idx
  on public.builder_trade_attributions (source_builder_fee_import_id)
  where source_builder_fee_import_id is not null;

create unique index if not exists builder_trade_attributions_source_evidence_idx
  on public.builder_trade_attributions (source_evidence_key)
  where source_evidence_key is not null
    and status = 'confirmed';

create or replace function public.rpc_touch_polymarket_builder_fee_imports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_polymarket_builder_fee_imports on public.polymarket_builder_fee_imports;
create trigger touch_polymarket_builder_fee_imports
before update on public.polymarket_builder_fee_imports
for each row
execute function public.rpc_touch_polymarket_builder_fee_imports();

alter table public.polymarket_builder_fee_imports enable row level security;
alter table public.polymarket_builder_fee_reconciliation_runs enable row level security;
