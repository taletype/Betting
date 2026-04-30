# Referral Hardening

Referral capture supports `/?ref=CODE`, `/polymarket?ref=CODE`, market detail links such as `/polymarket/[slug]?ref=CODE`, shared market links, and ambassador invite links.

Rules:
- First valid referral wins. A later code must not overwrite an existing valid attribution.
- Codes are normalized to uppercase and must match the referral code validator.
- Self-referral is rejected after the user identity is known.
- Disabled and malformed codes are rejected.
- Duplicate attribution attempts are idempotent and recorded for review.
- Referral apply failures must not block market browsing.

The browser stores a pending referral in localStorage and a SameSite cookie before login. After signup/login, the apply request includes an idempotency key and a non-secret session identifier. Server audit events record referral seen, captured, applied, and rejected outcomes without storing raw auth headers or secrets.
