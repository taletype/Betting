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
- Creating a request moves only selected payable rewards into the reserved accounting state and writes `reserved_by_payout_id`.
- Failed or cancelled requests release only rewards where `reserved_by_payout_id = payout.id` back to payable.
- Paid requests mark only rewards where `reserved_by_payout_id = payout.id` as paid.

Payout state changes never auto-send crypto. Operators must manually execute payment, then record the Polygon transaction hash. Admin authorization must come from authenticated admin identity, not spoofable request headers.

Admin endpoints and pages must write `admin_audit_log` with actor admin user id, target type/id, action, before/after status, note, metadata, and timestamp. Service-role keys must never be exposed to frontend code.
