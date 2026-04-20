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
    'withdrawal',
    'reconciliation_adjustment'
  )
);
