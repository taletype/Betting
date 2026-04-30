create table if not exists public.wallet_link_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain text not null,
  nonce_hash text not null,
  domain text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_link_challenges_nonce_hash_key unique (nonce_hash),
  constraint wallet_link_challenges_expires_after_issued check (expires_at > issued_at),
  constraint wallet_link_challenges_consumed_after_issued check (consumed_at is null or consumed_at >= issued_at)
);

create index if not exists wallet_link_challenges_user_created_idx
  on public.wallet_link_challenges (user_id, created_at desc);

create index if not exists wallet_link_challenges_expiry_idx
  on public.wallet_link_challenges (expires_at);

alter table public.wallet_link_challenges enable row level security;
