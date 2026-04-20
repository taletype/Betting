import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildWithdrawalCompletedLedgerEntries,
  buildWithdrawalFailedLedgerEntries,
  buildWithdrawalRequestedLedgerEntries,
} from "./repository";

const totalForDirection = (
  entries: readonly { direction: "debit" | "credit"; amount: bigint }[],
  direction: "debit" | "credit",
): bigint => entries.filter((entry) => entry.direction === direction).reduce((sum, entry) => sum + entry.amount, 0n);

test("requested withdrawal journal remains balanced", () => {
  const entries = buildWithdrawalRequestedLedgerEntries({
    userId: "00000000-0000-4000-8000-000000000001",
    amount: 42n,
    currency: "USDC",
  });

  assert.equal(totalForDirection(entries, "debit"), totalForDirection(entries, "credit"));
});

test("failed withdrawal journal remains balanced", () => {
  const entries = buildWithdrawalFailedLedgerEntries({
    userId: "00000000-0000-4000-8000-000000000001",
    amount: 77n,
    currency: "USDC",
  });

  assert.equal(totalForDirection(entries, "debit"), totalForDirection(entries, "credit"));
});

test("completed withdrawal journal remains balanced", () => {
  const entries = buildWithdrawalCompletedLedgerEntries({
    userId: "00000000-0000-4000-8000-000000000001",
    amount: 13n,
    currency: "USDC",
  });

  assert.equal(totalForDirection(entries, "debit"), totalForDirection(entries, "credit"));
});

test("withdrawal migration adds statuses and journal kinds", () => {
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0017_base_withdrawals.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.withdrawals/i);
  assert.match(migration, /status in \('requested', 'completed', 'failed'\)/i);
  assert.match(migration, /'withdrawal_requested'/i);
  assert.match(migration, /'withdrawal_completed'/i);
  assert.match(migration, /'withdrawal_failed'/i);
});
