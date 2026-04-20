create table if not exists public.linked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  chain text not null check (chain in ('base')),
  wallet_address text not null,
  signature text not null,
  signed_message text not null,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (chain, wallet_address)
);

create index if not exists linked_wallets_user_id_idx on public.linked_wallets (user_id);

create table if not exists public.chain_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  chain text not null check (chain in ('base')),
  tx_hash text not null,
  tx_sender text not null,
  tx_recipient text not null,
  token_address text not null,
  amount bigint not null check (amount > 0),
  currency text not null,
  block_number bigint not null,
  tx_status text not null check (tx_status in ('confirmed', 'rejected')),
  journal_id uuid references public.ledger_journals (id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  unique (chain, tx_hash)
);

create index if not exists chain_deposits_user_id_created_at_idx
  on public.chain_deposits (user_id, created_at desc);

create table if not exists public.deposit_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tx_hash text not null,
  status text not null check (status in ('accepted', 'rejected')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deposit_verification_attempts_user_id_created_at_idx
  on public.deposit_verification_attempts (user_id, created_at desc);

alter table public.linked_wallets enable row level security;
alter table public.chain_deposits enable row level security;
alter table public.deposit_verification_attempts enable row level security;

alter table public.ledger_journals
drop constraint if exists ledger_journals_journal_kind_check;

alter table public.ledger_journals
add constraint ledger_journals_journal_kind_check
check (
  journal_kind in (
    'order_reserve',
    'order_release',
    'reserve',
    'release',
    'settle',
    'deposit',
    'deposit_confirmed',
    'withdrawal',
    'reconciliation_adjustment',
    'claim_payout'
  )
);
