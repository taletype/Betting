create table if not exists public.market_realtime_sequences (
  market_id uuid primary key references public.markets (id) on delete cascade,
  sequence bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.market_realtime_sequences enable row level security;
