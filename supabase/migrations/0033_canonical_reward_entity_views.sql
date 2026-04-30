create or replace view public.reward_ledger_entries as
select
  id,
  recipient_user_id,
  source_trade_attribution_id,
  reward_type,
  amount_usdc_atoms,
  status,
  created_at,
  payable_at,
  paid_at,
  voided_at,
  void_reason
from public.ambassador_reward_ledger;

create or replace view public.payout_requests as
select
  id,
  recipient_user_id,
  amount_usdc_atoms,
  status,
  destination_type,
  destination_value,
  payout_chain,
  payout_chain_id,
  payout_asset,
  payout_asset_decimals,
  asset_contract_address,
  reviewed_by,
  reviewed_at,
  paid_at,
  tx_hash,
  notes,
  created_at
from public.ambassador_reward_payouts;
