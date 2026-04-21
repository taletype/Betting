# Release Candidate Freeze Plan (v1.0)

Date: 2026-04-21  
Scope: `taletype/betting` launch RC freeze pass (docs + release planning only).

## 1) Repo-state inspection snapshot

### Open changes
- Working tree is currently clean (`git status --short` returned no pending file changes).
- Current branch: `work`.
- Recent launch-critical hardening already landed in history:
  - `726d046` (Supabase-session identity + admin gate hardening)
  - `7498e35` (migration renumbering conflict fix)

### Launch docs / runbooks status
- Launch hardening snapshot exists and explicitly points to this RC plan as active source of truth: `infra/docs/launch-readiness.md`.
- Launch-day execution checklist exists: `infra/docs/runbooks/launch-checklist.md`.
- Staging dress rehearsal runbook exists with artifact expectations: `infra/docs/runbooks/staging-launch-drill.md`.
- Ops runbook index is current and links all launch-critical runbooks: `infra/docs/runbooks/operations.md`.

### Migration folders / schema churn status
- Migration chain is sequential and contiguous from `0001` through `0020`.
- Latest migrations are launch-flow migrations:
  - `0019_base_deposit_flow.sql`
  - `0020_base_withdrawals.sql`
- Most recent migration activity was conflict cleanup + Base flows, indicating churn has only recently settled.

### Package scripts / launch-critical commands present
- Workspace: `pnpm typecheck`, `pnpm test`, `pnpm smoke:db`, `pnpm drill:staging`.
- DB-backed local reset + smoke path: `pnpm db:reset`.
- Staging drill entrypoint: `pnpm drill:staging`.

### Known launch caveats (from current docs)
- Launch signoff still requires one passing DB-backed smoke artifact run (`latest.log` + `latest.json`) in CI/staging context.
- `0012_rls_policies.sql` still carries TODO ambiguity that must be treated as a documented temporary posture until post-launch tightening.

---

## 2) Short RC checklist (authoritative)

Mark all items complete before RC cut:

- [ ] **Typecheck green:** `pnpm typecheck`
- [ ] **Tests green:** `pnpm test`
- [ ] **DB-backed smoke artifact passing:** `pnpm smoke:db` (archive `infra/artifacts/smoke-db/latest.log` + `latest.json`)
- [ ] **Auth/admin gating fixed and verified:** confirm Supabase-session identity path + admin token gates are active in deployed RC build
- [ ] **Reconciliation clean:** one reconciliation run with zero invariant mismatches
- [ ] **Deposit + withdrawal lifecycle proven:** staging drill evidence covers verify -> trade/resolution/claim -> withdrawal request -> admin execute/fail
- [ ] **Runbooks current:** launch checklist + staging drill + operations index match current endpoints/flows
- [ ] **Env/secrets audit complete:** `./infra/scripts/check-env.sh` + env matrix review (`replace-me/changeme` free)
- [ ] **Kill switches confirmed:** operator can toggle and validate order/deposit/withdraw/external-sync/ws switches
- [ ] **Staging drill completed:** `pnpm drill:staging` artifacts stored under timestamped drill directory

---

## 3) Schema freeze recommendation

### Decision
**Freeze schema now at migration `0020_base_withdrawals.sql` (effective 2026-04-21).**

### Launch-blocking exception rule
Only allow new migrations pre-launch if **all** are true:
1. Fixes a proven launch blocker (integrity, custody, auth/security, or inability to operate).
2. No reasonable application-layer workaround exists.
3. Explicit launch-captain signoff is recorded in RC notes.

### Current recommendation based on repo state
- No additional planned migrations are evidenced in current docs/runbooks for RC readiness.
- Therefore: **default to no further schema changes before launch**.

---

## 4) Merge / branch order before RC cut

Apply remaining merge candidates in this exact order:

1. **Release-integrity blockers first (must land before RC cut)**
   - Any fix that unblocks `pnpm typecheck`, `pnpm test`, `pnpm smoke:db`, or reconciliation clean run.
   - Any auth/admin gating regression fix.

2. **Ops-evidence blockers second (must land before RC cut)**
   - Runbook corrections required to execute launch checklist/drill without ambiguity.
   - Artifact path/command correctness for smoke + drill evidence capture.

3. **RC polish third (merge only if zero risk)**
   - Small docs clarity edits that do not change runtime behavior or schema.

### Blockers before RC cut
- Any red in the short RC checklist above.
- Missing DB smoke artifact evidence.
- Missing staging drill evidence.

### Safe-to-defer until post-launch
- Additional automation (e.g., CI expansion) not required for day-1 operation.
- Non-critical doc polish.
- Any feature or schema expansion.

---

## 5) Launch blocker list (grouped)

### Must fix before launch
- Failing `pnpm typecheck` or `pnpm test`.
- Failing or missing DB-backed smoke artifact (`pnpm smoke:db`).
- Auth/admin gating regressions in RC deploy.
- Any reconciliation invariant mismatch affecting balances or custody state.
- Inability to demonstrate deposit + withdrawal lifecycle in staging drill.
- Missing/incorrect runbook steps that block operator execution.

### Should fix soon after launch
- CI automation to run `pnpm smoke:db` and publish artifacts automatically.
- Follow-up tightening/clarification work for RLS TODO scope in `0012_rls_policies.sql`.
- Additional operator ergonomics around manual withdrawal queue handling.

### Safe to defer
- New feature work.
- Architectural refactors.
- Non-launch-critical performance tuning.
- Any non-break/fix migration after freeze point.
