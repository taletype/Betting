# Polymarket wallet and chain model

This app treats wallet verification as EVM account ownership proof. The current wallet-link challenge records `chain = base` only as the challenge namespace; it is not a funding or payout rail and must not be presented as the payout chain.

Funding and payout rails are separate. Wallet funding copy may reference Polygon / USDC where Thirdweb Pay is configured for wallet funding. Reward payouts remain manual/admin-approved and use Polygon pUSD where that rail is configured.

Polymarket trading is a third flow. A user must connect their own wallet, verify ownership, set up user-owned Polymarket L2 credentials, review the order, and sign their own Polymarket order. The platform must not use platform-owned credentials for user trades and must not mutate internal trading/betting balances from Polymarket activity.
