alter table public.ambassador_reward_ledger
  drop constraint if exists ambassador_reward_ledger_status_check;

alter table public.ambassador_reward_ledger
  add constraint ambassador_reward_ledger_status_check
  check (status in ('pending', 'payable', 'approved', 'paid', 'void'));

create index if not exists ambassador_reward_ledger_recipient_approved_idx
  on public.ambassador_reward_ledger (recipient_user_id, approved_at desc)
  where status = 'approved';
