create table if not exists public.polymarket_routed_order_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  market_external_id text not null,
  market_slug text,
  token_id text not null,
  side text not null check (side in ('BUY', 'SELL')),
  price numeric not null check (price > 0 and price < 1),
  size numeric not null check (size > 0),
  notional_usdc_atoms bigint not null check (notional_usdc_atoms > 0),
  builder_code_attached boolean not null default false,
  polymarket_order_id text,
  referral_attribution_id uuid references public.referral_attributions (id) on delete set null,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists polymarket_routed_order_audits_user_created_idx
  on public.polymarket_routed_order_audits (user_id, created_at desc);

create index if not exists polymarket_routed_order_audits_referral_idx
  on public.polymarket_routed_order_audits (referral_attribution_id)
  where referral_attribution_id is not null;

alter table public.polymarket_routed_order_audits enable row level security;
