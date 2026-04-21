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
