update public.ambassador_reward_ledger
   set status = 'payable'
 where status = 'approved';

alter table public.ambassador_reward_ledger
  drop constraint if exists ambassador_reward_ledger_status_check;

alter table public.ambassador_reward_ledger
  add constraint ambassador_reward_ledger_status_check
  check (status in ('pending', 'payable', 'paid', 'void'));
