create table if not exists public.ledger_journals (
  id uuid primary key default gen_random_uuid(),
  journal_kind text not null check (journal_kind in ('reserve', 'release', 'settle', 'deposit', 'withdrawal', 'reconciliation_adjustment')),
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (journal_kind, reference)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.ledger_journals (id) on delete restrict,
  account_code text not null,
  direction text not null check (direction in ('debit', 'credit')),
  amount bigint not null,
  currency text not null,
  created_at timestamptz not null default now()
);

alter table public.ledger_journals enable row level security;
alter table public.ledger_entries enable row level security;
