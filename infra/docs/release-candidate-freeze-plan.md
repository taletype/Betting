# Release Candidate Freeze & Merge Plan

Date: 2026-04-20
Owner: Launch captain / release manager
Scope: RC freeze pass for `taletype/betting` monorepo. No feature expansion.

## 1) Current workspace status snapshot

### 1.1 Package scripts and launch-critical entry points

Root launch/verification scripts currently available:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:reset`
- `pnpm smoke:local`
- `pnpm load:launch`

Service-specific launch-critical script:

- `pnpm --filter @bet/service-api test:db-happy-path`

Operational note:

- `pnpm db:reset` already includes DB reset and `test:db-happy-path` execution, so this is the canonical DB-backed pre-RC command.

### 1.2 Migrations status (recent churn)

Current migration chain is sequential (`0001` .. `0020`) and includes recent Base flows:

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

3. Bring up DB and apply full schema/seed + DB happy path

```bash
supabase start
pnpm db:reset
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
2. Terminal output for `pnpm db:reset` showing:
   - migrations applied cleanly,
   - `test:db-happy-path` passes.
3. Terminal output for `pnpm smoke:local` showing all checks pass.
4. Health endpoint responses:
   - `GET /health` (API)
   - `GET /ready` (API)
   - `GET /health` (WS)
5. One reconciliation worker run log without invariant failures.
6. Migration inventory snapshot (`ls -1 supabase/migrations | sort`) attached with RC artifact.

### 2.3 Launch blockers (must resolve before RC/launch)

Any of the following is a launch blocker:

1. `pnpm lint`, `pnpm typecheck`, or `pnpm test` failure on RC commit.
2. `pnpm db:reset` failure (including any migration failure or `test:db-happy-path` failure).
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

**Recommendation: begin schema freeze now (2026-04-20), with one exception class: break/fix migrations only.**

### Rationale

- Migration chain is now sequential through `0020`.
- Base deposit/withdrawal schema landed and renumber conflict was already resolved.
- Current program objective is launch stabilization, not capability expansion.

### Branches/changes that must land before freeze lock

Treat these as pre-freeze must-lands if still pending in any branch/PR:

1. Anything modifying or depending on:
   - `0019_base_deposit_flow.sql`
   - `0020_base_withdrawals.sql`
2. Any fix for migration ordering/numbering consistency.
3. Any reconciliation correctness fix required for new deposit/withdrawal flows.

After those land, reject new non-break/fix migrations until post-launch window opens.

## 4) Merge order for release candidate

Use this ordering for open work streams.

### 4.1 Must merge before RC

1. **Schema and funds correctness lane**
   - migration ordering/finality (`0019`/`0020` integrity),
   - deposit/withdrawal ledger correctness,
   - reconciliation invariant correctness.
2. **Launch reliability lane**
   - health/readiness correctness,
   - `smoke:local` reliability fixes,
   - DB happy-path script reliability fixes.
3. **Operational readiness lane**
   - runbooks/checklists required to execute launch without tribal knowledge.

### 4.2 Nice to merge before RC

1. Monitoring/reporting polish that does not alter schema or critical runtime behavior.
2. Small docs improvements that reduce operator ambiguity.
3. Low-risk test robustness improvements outside launch-critical path.

### 4.3 Defer until after launch

1. New product features and surface area expansion.
2. Broad refactors (module moves, architecture cleanup, large renames).
3. Non-essential migration additions unrelated to production break/fix.
4. Deep performance tuning not tied to a measured launch blocker.

## 5) Minimal stale-content cleanup completed in this pass

1. Added explicit cross-link in launch checklist to this RC freeze plan to avoid split source-of-truth during launch week.
2. Added runbook index link to this RC freeze plan.
3. Added note in launch-readiness hardening report that it is a historical verification snapshot, while this RC freeze plan is the active operational checklist.

