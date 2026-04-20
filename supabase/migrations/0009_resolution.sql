create table if not exists public.resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null unique references public.markets (id) on delete cascade,
  status text not null check (status in ('pending', 'proposed', 'finalized', 'cancelled')),
  winning_outcome_id uuid references public.outcomes (id) on delete restrict,
  evidence_url text,
  notes text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resolutions enable row level security;

alter table public.claims
  add constraint claims_resolution_id_fkey
  foreign key (resolution_id) references public.resolutions (id) on delete set null;
