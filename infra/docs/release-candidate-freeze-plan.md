# Release Candidate Freeze Plan — Base Sepolia Staging (v1)

Date: 2026-04-21  
Mode: stabilize-and-land (execution only; no feature expansion)

## 1) Inspection snapshot (current repo state)

### Launch docs / runbooks
- Launch hardening snapshot exists: `infra/docs/launch-readiness.md`.
- Staging drill exists and uses one required command: `pnpm smoke:base-sepolia`.
- Launch checklist exists: `infra/docs/runbooks/launch-checklist.md`.
- Reconciliation and withdrawal runbooks exist and are aligned to current auth posture.

### Schema / migrations
- Migration chain is contiguous through `0020_base_withdrawals.sql`.
- Latest launch-flow migrations are:
  - `0019_base_deposit_flow.sql`
  - `0020_base_withdrawals.sql`

### Smoke harness status
- Canonical command: `pnpm smoke:base-sepolia`.
- Artifact target: `infra/artifacts/smoke-db/latest.log` and `infra/artifacts/smoke-db/latest.json`.
- Current repo artifact directory is empty until a passing staging run is captured.

### Auth/admin hardening status
- Request identity derives from Supabase session user in `apps/web/src/app/api/auth.ts`.
- Admin RPC path is gated by explicit admin-role decision in `apps/web/src/app/api/[...path]/route.ts`.

### Open branches / merge notes (documented)
- No additional open-branch merge queue is documented in repo runbooks.
- Use this file as the RC merge/freeze source of truth.

---

## 2) RC checklist (authoritative)

Mark each item PASS/FAIL with artifact links.

- [ ] **Base Sepolia config verified**
  - Evidence: `BASE_CHAIN_ID=84532`, `BASE_TREASURY_ADDRESS`, `BASE_USDC_ADDRESS`, DB URL set in target env.
- [ ] **Passing smoke artifact present**
  - Command: `pnpm smoke:base-sepolia`
  - Required files: `infra/artifacts/smoke-db/latest.log`, `infra/artifacts/smoke-db/latest.json`
- [ ] **Auth/admin gating fixed**
  - Evidence: session-based identity + admin-role gate validation in staging drill notes.
- [ ] **Reconciliation clean**
  - Command: `pnpm --filter @bet/reconciliation-worker dev`
  - Evidence: one successful cycle log with no critical failures.
- [ ] **Deposit/withdraw lifecycle proven**
  - Evidence: smoke JSON/log includes deposit verify, trade lifecycle, claim, withdrawal request, admin execute/fail outputs.
- [ ] **Runbooks current**
  - Confirm: launch checklist + staging drill + withdrawals/reconciliation runbooks match shipped behavior.
- [ ] **Schema freeze accepted**
  - Freeze at `0020_base_withdrawals.sql` unless launch-blocking exception is approved.
- [ ] **Final blocker list reviewed and empty**
  - Release manager signoff recorded in RC ticket.

---

## 3) Merge order and freeze order

### Merge order (strict)
1. **Launch-integrity fixes only** (red test/typecheck, smoke failures, auth/admin regressions, reconciliation correctness).
2. **Ops/runbook evidence fixes** (only what is needed to execute and sign off launch safely).
3. **RC cut/tag** once checklist in section 2 is fully PASS.

### Freeze order
1. **Feature freeze**: effective immediately.
2. **Schema freeze**: hold at migration `0020_base_withdrawals.sql`.
3. **Docs freeze for launch-critical runbooks** after final drill rehearsal.
4. **Deploy freeze window**: no non-blocker merges during go/no-go window.

Schema exception policy (pre-launch): allow only launch-blocking break/fix with release-manager approval.

---

## 4) Remaining work grouping

### Must fix before launch
1. Produce one passing **Base Sepolia smoke artifact** and attach `latest.log` + `latest.json`.
2. Produce one **clean reconciliation run** artifact.
3. Complete staging drill evidence pack in `infra/artifacts/launch-drill/<UTC timestamp>/`.
4. Confirm final go/no-go checklist is all PASS.

### Should fix soon after launch
1. Add CI job to run `pnpm smoke:base-sepolia` automatically and upload artifacts.
2. Automate publishing smoke artifacts into release signoff ticket/workflow.

### Safe to defer
1. Additional load/scenario expansion beyond current launch lifecycle.
2. Non-break/fix schema additions after `0020`.
3. Non-critical docs polish outside launch-critical runbooks.

---

## 5) RC decision rule

**GO** only when every checklist item in section 2 is PASS with linked artifacts.
**NO-GO** if any item is FAIL or missing evidence.
