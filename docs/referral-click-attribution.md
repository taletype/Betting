# Referral Click Attribution

Referral links support `/?ref=CODE`, `/polymarket?ref=CODE`, `/polymarket/[slug]?ref=CODE`, and ambassador market-share links. Link creation preserves the destination path and appends `?ref=CODE` or `&ref=CODE` without exposing private user data.

Click capture happens before login. The web client stores the first valid code in a SameSite cookie and localStorage, records a best-effort `/referrals/click`, and keeps market browsing working even if capture fails. After login/signup, `/referrals/apply` applies the pending code.

Rules:
- Referral codes must normalize to `A-Z`, `0-9`, `_`, or `-`, length 3-64.
- Code must exist in an active `ambassador_codes` record.
- Disabled, malformed, and unknown codes are rejected and audited.
- First valid referral wins; a later code never overwrites an existing attribution.
- Duplicate applications are idempotent or recorded as rejected attempts.
- Self-referral is rejected.

Audit events:
- `referral_code_seen`
- `referral_code_captured`
- `referral_code_apply_attempted`
- `referral_code_applied`
- `referral_code_rejected`

Tables:
- `referral_clicks` stores click-level evidence.
- `referral_sessions` stores anonymous session state.
- `pending_referral_attributions` bridges pre-login clicks to post-login attribution.
- `referral_attributions` remains the applied first-valid attribution table.
