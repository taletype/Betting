import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseExecutor } from "@bet/db";
import type { ChainTxMonitor, TxMonitoringResult } from "@bet/chain";

import { runBaseTreasuryReconciliation } from "./baseTreasuryReconciliation";

const createDb = (input: {
  deposits?: Array<{ id: string; user_id: string; tx_hash: string; amount: bigint; currency: string }>;
  withdrawals?: Array<{ id: string; user_id: string; tx_hash: string | null; amount: bigint; currency: string }>;
}): DatabaseExecutor => ({
  query: async <T>(statement: string): Promise<T[]> => {
    if (statement.includes("from public.chain_deposits")) {
      return (input.deposits ?? []) as T[];
    }

    if (statement.includes("from public.withdrawal_requests")) {
      return (input.withdrawals ?? []) as T[];
    }

    throw new Error(`unexpected query: ${statement}`);
  },
});

const createMonitor = (states: Record<string, TxMonitoringResult>): ChainTxMonitor => ({
  monitorTransaction: async ({ txHash }) => {
    const state = states[txHash];
    if (!state) {
      throw new Error(`no monitoring state for ${txHash}`);
    }

    return state;
  },
});

test("base treasury reconciliation success path", async () => {
  const report = await runBaseTreasuryReconciliation({
    db: createDb({
      deposits: [{ id: "dep-1", user_id: "u1", tx_hash: "0xdep1", amount: 100n, currency: "USDC" }],
      withdrawals: [{ id: "wd-1", user_id: "u1", tx_hash: "0xwd1", amount: 40n, currency: "USDC" }],
    }),
    chainMonitor: createMonitor({
      "0xdep1": { state: "confirmed", txHash: "0xdep1", confirmations: 20 },
      "0xwd1": { state: "confirmed", txHash: "0xwd1", confirmations: 20 },
    }),
    minConfirmations: 12,
  });

  assert.equal(report.failures.length, 0);
  assert.equal(report.treasurySummary.netAmount, 60n);
});

test("flags credited deposit whose tx is missing", async () => {
  const report = await runBaseTreasuryReconciliation({
    db: createDb({
      deposits: [{ id: "dep-1", user_id: "u1", tx_hash: "0xdep1", amount: 100n, currency: "USDC" }],
    }),
    chainMonitor: createMonitor({
      "0xdep1": { state: "missing", txHash: "0xdep1", confirmations: 0 },
    }),
    minConfirmations: 12,
  });

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.check, "base_deposit_tx_not_finalized");
});

test("flags duplicate tx hash usage", async () => {
  const report = await runBaseTreasuryReconciliation({
    db: createDb({
      deposits: [
        { id: "dep-1", user_id: "u1", tx_hash: "0xdup", amount: 100n, currency: "USDC" },
        { id: "dep-2", user_id: "u2", tx_hash: "0xdup", amount: 200n, currency: "USDC" },
      ],
    }),
    chainMonitor: createMonitor({
      "0xdup": { state: "confirmed", txHash: "0xdup", confirmations: 20 },
    }),
    minConfirmations: 12,
  });

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.check, "base_duplicate_tx_hash_usage");
});

test("flags completed withdrawal whose tx failed", async () => {
  const report = await runBaseTreasuryReconciliation({
    db: createDb({
      withdrawals: [{ id: "wd-1", user_id: "u1", tx_hash: "0xwd1", amount: 40n, currency: "USDC" }],
    }),
    chainMonitor: createMonitor({
      "0xwd1": { state: "failed", txHash: "0xwd1", confirmations: 0 },
    }),
    minConfirmations: 12,
  });

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.check, "base_withdrawal_tx_not_confirmed");
});
