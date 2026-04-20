create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  chain text not null check (chain in ('base')),
  amount bigint not null check (amount > 0),
  currency text not null,
  destination_address text not null,
  status text not null check (status in ('requested', 'completed', 'failed')),
  requested_journal_id uuid not null references public.ledger_journals (id) on delete restrict,
  completed_journal_id uuid references public.ledger_journals (id) on delete restrict,
  failed_journal_id uuid references public.ledger_journals (id) on delete restrict,
  processed_by uuid references public.profiles (id) on delete set null,
  processed_at timestamptz,
  tx_hash text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'requested' and processed_at is null and processed_by is null and tx_hash is null and failure_reason is null)
    or (status = 'completed' and processed_at is not null and tx_hash is not null and failure_reason is null)
    or (status = 'failed' and processed_at is not null and failure_reason is not null and tx_hash is null)
  )
);

create index if not exists withdrawals_user_id_created_at_idx
  on public.withdrawals (user_id, created_at desc);

create index if not exists withdrawals_status_created_at_idx
  on public.withdrawals (status, created_at asc)
  where status = 'requested';

alter table public.withdrawals enable row level security;

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
      'withdrawal_requested',
      'withdrawal_completed',
      'withdrawal_failed',
      'reconciliation_adjustment',
      'claim_payout'
    )
  );
