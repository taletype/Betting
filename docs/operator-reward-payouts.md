# Operator Reward Payouts

Payouts are manual and admin-approved. The system must not auto-send crypto, auto-transfer treasury funds, or expose service-role keys to frontend code.

User requests:
- User can request payout only from payable rewards.
- Requested amount cannot exceed payable balance.
- Duplicate open requests are blocked.
- Wallet payout requires a valid `0x` EVM address.
- Current payout rail is Polygon mainnet chain `137` and asset `pUSD`.
- Creating a payout request reserves payable reward rows; it does not mark them paid.

Admin actions:
- Approve payout after review.
- Cancel payout.
- Mark payout failed.
- Mark payout paid only after manual payment and Polygon transaction hash recording.
- Add notes and preserve audit trail with actor admin user id, target id, action, timestamp, and status change.

Open high-severity fraud flags block approval until reviewed.

Admin security:
- Admin pages must use authenticated admin authorization and must not trust spoofable `x-admin` headers.
- Frontend code must not import service-role clients or expose service-role keys.
- Every payout state change writes an audit-log entry before the operator treats the action as complete.
