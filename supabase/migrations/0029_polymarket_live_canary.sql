create table if not exists public.polymarket_l2_credentials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  wallet_address text not null check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  encrypted_credentials jsonb not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked' and revoked_at is not null) or (status = 'active' and revoked_at is null))
);

create index if not exists polymarket_l2_credentials_wallet_idx
  on public.polymarket_l2_credentials (lower(wallet_address))
  where status = 'active';

create table if not exists public.polymarket_routed_order_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  audit_id uuid references public.polymarket_routed_order_audits (id) on delete set null,
  market_external_id text not null,
  token_id text not null,
  side text not null check (side in ('BUY', 'SELL')),
  status text not null check (status in ('submitted', 'rejected', 'failed')),
  polymarket_order_id text,
  builder_code_attached boolean not null default false,
  safe_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists polymarket_routed_order_attempts_user_created_idx
  on public.polymarket_routed_order_attempts (user_id, created_at desc);

alter table public.polymarket_l2_credentials enable row level security;
alter table public.polymarket_routed_order_attempts enable row level security;
