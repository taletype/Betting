# Thirdweb Wallet Funding

Thirdweb is a wallet connection and funding utility only. Supabase remains the app identity source of truth.

## User Flow

1. User captures a pending referral with `?ref=CODE`.
2. User browses public Polymarket markets.
3. User signs up or logs in through Supabase.
4. Server validates the Supabase session and applies the pending referral if valid.
5. User connects a wallet through Thirdweb.
6. Wallet may be linked only after ownership proof tied to the Supabase user.
7. User may open Thirdweb funding/onramp/swap UI.
8. Funds go to the user-controlled wallet.

## Non-Custodial Copy

用戶可透過第三方錢包及付款服務為自己的錢包增值。資金會進入用戶自行控制的錢包，本平台不託管用戶資金。部分加密貨幣兌換或付款流程可能產生平台服務費；實際費用會在交易前顯示。

## Boundaries

- Thirdweb connected wallet alone does not imply logged-in app user.
- Thirdweb connected wallet alone does not imply admin.
- Funding completion may create analytics/provider-event records only.
- Thirdweb funding does not create internal balances.
- Thirdweb funding does not mutate the internal trading ledger.
- Thirdweb funding does not make a user eligible for ambassador rewards.
- Thirdweb secrets stay server-side and must not be committed.

## Analytics

Safe event names include `wallet_connect_started`, `wallet_connected`, `wallet_link_started`, `wallet_link_verified`, `wallet_funding_opened`, `wallet_funding_quoted`, `wallet_funding_completed`, `wallet_funding_failed`, `thirdweb_developer_fee_disclosed`, and `thirdweb_developer_fee_confirmed`.

Do not log private keys, service keys, signatures, complete auth headers, complete JWTs, Polymarket secrets, or Thirdweb secrets.
