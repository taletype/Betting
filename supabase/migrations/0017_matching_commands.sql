alter table public.orders
add column if not exists matching_processed_at timestamptz;

create table if not exists public.matching_commands (
  id uuid primary key default gen_random_uuid(),
  command_type text not null check (command_type in ('order_submitted_for_matching')),
  order_id uuid not null references public.orders (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  claim_expires_at timestamptz,
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  unique (command_type, order_id)
);

create index if not exists matching_commands_pending_idx
  on public.matching_commands (processed_at, claim_expires_at, created_at, id);

alter table public.matching_commands enable row level security;
