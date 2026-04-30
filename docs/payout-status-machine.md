# Payout Status Machine

Statuses:
- `requested`
- `approved`
- `paid`
- `failed`
- `cancelled`

Allowed transitions:
- `requested -> approved`
- `requested -> cancelled`
- `approved -> paid`
- `approved -> failed`
- `approved -> cancelled`
- `failed -> requested` only through an explicit new user request or admin action.

Invalid transitions are rejected. Approval never triggers payment. `paid` requires admin action and a valid Polygon transaction hash for wallet payouts.

Reward locking:
- Creating a request moves payable rewards into the reserved accounting state.
- Failed or cancelled requests release reserved rewards back to payable.
- Paid requests mark reserved rewards paid.
