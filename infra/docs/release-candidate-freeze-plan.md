# Release Candidate Freeze Plan (v1)

Date: 2026-04-21
Scope: Stabilize-and-land pass for `taletype/betting` (no new features).

## 1) Repo-state inspection summary (evidence-based)

### Launch/readiness docs
- `infra/docs/launch-readiness.md` is a hardening snapshot from 2026-04-20 and still lists one explicit must-fix: produce a passing `pnpm smoke:db` artifact in CI/staging (`latest.log` + `latest.json`).
- Launch-day and rehearsal docs exist and are current enough to execute operations:
  - launch day: `infra/docs/runbooks/launch-checklist.md`
  - staging drill: `infra/docs/runbooks/staging-launch-drill.md`
  - lifecycle runbooks: deposits, withdrawals/admin, reconciliation, incidents, environment configuration.

### Package scripts (launch-critical)
- Root scripts required for RC execution already exist:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm smoke:db`
  - `pnpm drill:staging`
- RC evidence should use `pnpm smoke:db` artifact output at `infra/artifacts/smoke-db/`.

### Migrations state
- Migration chain is currently linear and ends at:
  - `0019_base_deposit_flow.sql`
  - `0020_base_withdrawals.sql`
- No post-`0020` migrations are present in repo state.

### Known launch caveats from current repo/docs
- DB-backed smoke evidence in CI/staging is still pending signoff artifact generation.
- Auth/RLS hardening has an explicit TODO in `0012_rls_policies.sql`; launch should treat this as scoped/accepted debt with owner and post-launch date.
- External sync cron path is still called out as deferred in backlog split; do not treat as RC blocker unless launch scope changes.

## 2) RC checklist (short, authoritative)

> Mark each item complete in release signoff with links to command logs/artifacts.

- [ ] **Green typecheck:** `pnpm typecheck`
- [ ] **Green tests:** `pnpm test`
- [ ] **Passing DB-backed smoke artifact:** `pnpm smoke:db` with `infra/artifacts/smoke-db/latest.log` and `latest.json`
- [ ] **Auth/admin gating fixed:** verify admin token + user identity gates for admin actions (`x-admin-token`, admin actor `x-user-id`) and document temporary RLS posture acceptance
- [ ] **Reconciliation clean:** one successful reconciliation-worker run captured
- [ ] **Deposit + withdrawal lifecycle proven:** staging drill covers verify deposit, withdrawal request, admin execute, admin fail, and evidence snapshots
- [ ] **Runbooks current:** launch checklist + staging drill + ops runbooks aligned to current endpoints/flows
- [ ] **Env/secrets audit complete:** environment matrix validated and no placeholder values in target env
- [ ] **Kill switches confirmed:** API + WS + external-sync operational kill switches verified and documented
- [ ] **Staging drill completed:** `pnpm drill:staging` artifacts attached to RC signoff

## 3) Schema churn freeze recommendation

### Decision
**Freeze schema at migration `0020_base_withdrawals.sql` for RC and launch.**

### Launch-blocking migration exception policy
Allow new migrations only if they are all of:
1. production break/fix,
2. required to restore funds correctness, reconciliation correctness, or launch-path availability,
3. approved by release captain in RC ticket before merge.

### Current assessment
- There are no migrations after `0020`; no additional migration is currently evidenced as launch-blocking from repo state.
- Recommendation: **do not add new migrations before RC cut unless they meet exception policy above.**

## 4) Merge / branch order for remaining work

Use this exact sequence for any open merge candidates.

1. **Launch blockers first (must-merge lane)**
   - fixes that unblock green `typecheck`/`test`
   - DB-smoke failures or artifact generation issues
   - auth/admin gating correctness issues
   - reconciliation correctness defects
2. **RC evidence + runbook alignment lane**
   - docs/runbook corrections needed for operators to execute launch safely
   - staging drill and smoke artifact publication wiring
3. **RC cut**
   - tag/cut RC only when checklist in section 2 is fully green.
4. **Post-launch lane (safe to defer)**
   - automation/polish/refactors not required for section 2 checklist.

### Blockers before RC cut
- Missing passing `smoke:db` artifact from CI/staging.
- Any red status on `typecheck` or `test`.
- Any unresolved auth/admin gating defect for admin endpoints.
- Any failed reconciliation check on release candidate commit.

### Safe-to-defer after launch
- CI automation improvements beyond minimum evidence capture.
- External-sync cron trigger hardening/polish if core launch path is unaffected.
- Broad auth/RLS redesign beyond explicit launch-safe posture acceptance.
- Non-break/fix schema additions.
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
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:reset`
- `pnpm smoke:db`
- `pnpm smoke:local`
- `pnpm load:launch`

Operational note:

- `pnpm smoke:db` is the canonical DB-backed lifecycle evidence command (local/CI/staging), including artifact capture.

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
- `0019_base_deposit_flow.sql`
- `0020_base_withdrawals.sql`

Recent history also shows a same-day migration renumbering fix to remove duplicate version conflicts. That indicates schema churn has stabilized but was active very recently.

### 1.3 Launch-readiness docs and runbooks present

Present and useful for RC + launch:

- `infra/docs/launch-readiness.md` (hardening report snapshot)
- `infra/docs/runbooks/launch-checklist.md` (short launch-day checklist)
- `infra/docs/runbooks/operations.md` (runbook index)
- Focused operational runbooks (`deposit-verification`, `withdrawals-admin`, `reconciliation-worker`, `external-sync-worker`, `incidents`, etc.)

### 1.4 Drift observed between code and docs

Drift/open items identified during freeze pass:

1. Launch docs are split between a dated hardening report and a short checklist; this document is now the operational RC source of truth.
2. DB-backed verification is documented, but RC evidence requirements were not previously explicit (what exact logs/screenshots/artifacts must be captured).
3. Migration churn happened on 2026-04-20; explicit schema-freeze gate was not previously documented.

## 2) RC checklist (authoritative)

Run in order from repo root.

### 2.1 Exact commands to run before RC

1. Environment validation

```bash
./infra/scripts/check-env.sh
```

2. Dependency and workspace baseline

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

3. Bring up DB and apply full schema/seed + DB happy path artifact run

```bash
supabase start
SMOKE_DB_PREP_MODE=reset-local pnpm smoke:db
```

4. Bring up launch-path services

```bash
pnpm dev:api
pnpm dev:workers
pnpm dev:web
```

5. Full local smoke

```bash
pnpm smoke:local
```

6. Optional-but-recommended launch load sanity pass

```bash
pnpm load:launch
```

### 2.2 Exact evidence to capture

Capture and attach to RC ticket/release notes:

1. Terminal output (or CI artifact) for:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
2. Terminal output for `pnpm smoke:db` showing:
   - connectivity check passes,
   - prep step succeeds (if enabled),
   - DB happy-path passes.
3. Artifact files from `infra/artifacts/smoke-db/`:
   - `latest.log`
   - `latest.json`
4. Terminal output for `pnpm smoke:local` showing all checks pass.
5. Health endpoint responses:
   - `GET /health` (API)
   - `GET /ready` (API)
   - `GET /health` (WS)
6. One reconciliation worker run log without invariant failures.
7. Migration inventory snapshot (`ls -1 supabase/migrations | sort`) attached with RC artifact.

### 2.3 Launch blockers (must resolve before RC/launch)

Any of the following is a launch blocker:

1. `pnpm lint`, `pnpm typecheck`, or `pnpm test` failure on RC commit.
2. `pnpm smoke:db` failure (including any prep failure or `test:db-happy-path` failure).
3. `pnpm smoke:local` failure.
4. Missing health/readiness response for API/WS.
5. Any schema change PR proposed after freeze start without explicit launch captain approval.
6. Any reconciliation invariant mismatch affecting ledger/funds correctness.

### 2.4 Can wait until after launch (explicit deferrals)

Allowed post-launch if blocker list above is green:

1. CI enhancement to automatically run DB-backed happy-path in ephemeral DB.
2. Expansion of load scenarios beyond current launch-path harness.
3. Non-critical documentation cleanup beyond this freeze plan + checklist alignment.
4. Additional runbook ergonomics/formatting improvements.

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
1. Produce and attach one passing DB-backed smoke artifact (`latest.log` + `latest.json`) from CI/staging.
2. Ensure `pnpm typecheck` and `pnpm test` are green on RC commit.
3. Validate admin/auth gating behavior for admin routes and sign off temporary RLS posture.
4. Capture one clean reconciliation run in release evidence.
5. Complete and attach one full staging launch drill evidence pack.

### Should fix soon after launch
1. Add/standardize CI job to run `pnpm smoke:db` with artifact upload every release.
2. Tighten/document auth and middleware route-boundary posture to reduce misconfiguration risk.
3. Improve operator ergonomics for manual withdrawal queue handling.

### Safe to defer
1. New features and non-launch surface expansion.
2. Non-break/fix migrations beyond `0020`.
3. Large architectural refactors and broad subsystem rewrites.
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
1. Added explicit cross-link in launch checklist to this RC freeze plan to avoid split source-of-truth during launch week.
2. Added runbook index link to this RC freeze plan.
3. Added note in launch-readiness hardening report that it is a historical verification snapshot, while this RC freeze plan is the active operational checklist.
