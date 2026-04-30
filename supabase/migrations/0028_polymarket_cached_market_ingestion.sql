alter table public.external_markets
  add column if not exists question text,
  add column if not exists outcomes jsonb not null default '[]'::jsonb,
  add column if not exists outcome_prices jsonb not null default '[]'::jsonb,
  add column if not exists volume numeric,
  add column if not exists liquidity numeric,
  add column if not exists resolution_status text,
  add column if not exists source_url text;

update public.external_markets
set
  question = coalesce(question, nullif(title, '')),
  volume = coalesce(volume, volume_total),
  liquidity = coalesce(liquidity, volume_total),
  resolution_status = coalesce(resolution_status, status),
  source_url = coalesce(source_url, market_url)
where question is null
   or volume is null
   or liquidity is null
   or resolution_status is null
   or source_url is null;

create unique index if not exists external_markets_source_external_id_idx
  on public.external_markets (source, external_id);

create unique index if not exists external_markets_slug_idx
  on public.external_markets (slug)
  where slug <> '';

create table if not exists public.external_market_prices (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.external_markets (id) on delete cascade,
  source text not null check (source in ('polymarket', 'kalshi')),
  observed_at timestamptz not null default now(),
  outcome_prices jsonb not null default '[]'::jsonb,
  best_bid numeric,
  best_ask numeric,
  last_trade_price numeric,
  volume numeric,
  liquidity numeric,
  raw_json jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists external_market_prices_market_observed_idx
  on public.external_market_prices (market_id, observed_at);

alter table public.external_orderbook_snapshots
  add column if not exists market_id uuid references public.external_markets (id) on delete cascade,
  add column if not exists observed_at timestamptz;

update public.external_orderbook_snapshots
set
  market_id = coalesce(market_id, external_market_id),
  observed_at = coalesce(observed_at, captured_at)
where market_id is null
   or observed_at is null;

alter table public.external_orderbook_snapshots
  alter column market_id set not null,
  alter column observed_at set not null;

create unique index if not exists external_orderbook_snapshots_market_observed_idx
  on public.external_orderbook_snapshots (market_id, observed_at);

create table if not exists public.external_trades (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.external_markets (id) on delete cascade,
  source text not null check (source in ('polymarket', 'kalshi')),
  external_trade_id text not null,
  external_outcome_id text,
  side text check (side in ('buy', 'sell')),
  price numeric not null,
  price_ppm bigint not null,
  size numeric,
  size_atoms bigint,
  executed_at timestamptz not null,
  raw_json jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.external_trades (
  market_id,
  source,
  external_trade_id,
  external_outcome_id,
  side,
  price,
  price_ppm,
  size,
  size_atoms,
  executed_at,
  raw_json,
  source_provenance,
  last_seen_at,
  created_at,
  updated_at
)
select distinct on (source, external_trade_id)
  external_market_id,
  source,
  external_trade_id,
  external_outcome_id,
  side,
  price,
  price_ppm,
  size,
  size_atoms,
  executed_at,
  raw_json,
  source_provenance,
  coalesce(last_seen_at, now()),
  created_at,
  now()
from public.external_trade_ticks
order by source, external_trade_id, executed_at desc
on conflict do nothing;

create unique index if not exists external_trades_source_external_trade_id_idx
  on public.external_trades (source, external_trade_id);

create index if not exists external_trades_market_executed_at_idx
  on public.external_trades (market_id, executed_at desc);

alter table public.external_market_prices enable row level security;
alter table public.external_trades enable row level security;

drop policy if exists "public can read external market prices" on public.external_market_prices;
create policy "public can read external market prices"
  on public.external_market_prices
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public can read external trades" on public.external_trades;
create policy "public can read external trades"
  on public.external_trades
  for select
  to anon, authenticated
  using (true);
