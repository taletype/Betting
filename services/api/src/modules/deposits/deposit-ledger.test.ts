import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDepositLedgerEntries } from "./repository";

test("ledger deposit journal remains balanced", () => {
  const entries = buildDepositLedgerEntries({
    userId: "00000000-0000-4000-8000-000000000001",
    amount: 123n,
    currency: "USDC",
  });

  const debitTotal = entries
    .filter((entry) => entry.direction === "debit")
    .reduce((sum, entry) => sum + entry.amount, 0n);
  const creditTotal = entries
    .filter((entry) => entry.direction === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0n);

  assert.equal(debitTotal, creditTotal);
});

test("duplicate credit protection exists in migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0016_base_deposit_flow.sql"), "utf8");
  assert.match(migration, /unique \(chain, tx_hash\)/i);
});
