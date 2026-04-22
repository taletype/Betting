import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildMlmCommissionLedgerEntries,
  calculateCommissionAmount,
} from "./repository";

const totalForDirection = (
  entries: readonly { direction: "debit" | "credit"; amount: bigint }[],
  direction: "debit" | "credit",
): bigint => entries.filter((entry) => entry.direction === direction).reduce((sum, entry) => sum + entry.amount, 0n);

test("mlm commission journal remains balanced", () => {
  const entries = buildMlmCommissionLedgerEntries({
    beneficiaryUserId: "00000000-0000-4000-8000-000000000001",
    amount: 12345n,
    currency: "USDC",
  });

  assert.equal(totalForDirection(entries, "debit"), totalForDirection(entries, "credit"));
});

test("commission amount uses basis points", () => {
  assert.equal(calculateCommissionAmount(100_000n, 1000), 10_000n);
  assert.equal(calculateCommissionAmount(100_000n, 250), 2_500n);
});

test("mlm migration adds referral and commission tables", () => {
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0021_mlm_referrals.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.referral_codes/i);
  assert.match(migration, /create table if not exists public\.referral_relationships/i);
  assert.match(migration, /create table if not exists public\.mlm_commission_plans/i);
  assert.match(migration, /'mlm_commission'/i);
});
