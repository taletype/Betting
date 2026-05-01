# Referral Fraud Review

Fraud flags are lightweight and intended for admin review. They should not block aggressively unless the signal is clear.

Flags include:
- Same wallet refers itself.
- Same user tries multiple referral codes.
- Same session creates many referral attempts.
- Same IP creates many referral accounts when IP data is already available.
- Same payout wallet used by many accounts.
- Disabled code attempt.
- Suspicious rapid referral pattern.
- Duplicate referral application.
- Referrer and referred user share payout wallet.
- Order signer wallet does not match the bound user wallet.
- Builder Code mismatch.
- Confirmed revenue without route-event lineage.
- Payout wallet recently changed before payout request.

Do not collect invasive data. Hash IP, session, wallet, and user-agent signals where possible. Never log secrets, service-role keys, full auth headers, private keys, or raw bearer tokens.

The admin review surface should show flags beside referral attribution, reward ledger rows, and payout requests. Open high-severity payout-related flags require review before payout approval.
