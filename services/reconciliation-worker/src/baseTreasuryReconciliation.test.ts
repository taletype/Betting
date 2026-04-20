import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseExecutor } from "@bet/db";
import type { ChainTxMonitor, TxMonitoringResult } from "@bet/chain";

import { runBaseTreasuryReconciliation } from "./baseTreasuryReconciliation";

const createDb = (input: {
  deposits?: Array<{ id: string; user_id: string; tx_hash: string; amount: bigint; currency: string }>;
  withdrawals?: Array<{
    id: string;
    user_id: string;
    status: "requested" | "completed" | "failed";
    tx_hash: string | null;
    amount: bigint;
    currency: string;
    requested_journal_id: string;
    completed_journal_id: string | null;
    failed_journal_id: string | null;
    processed_by: string | null;
    processed_at: string | null;
    failure_reason: string | null;
  }>;
  journalEntries?: Array<{
    journal_id: string;
    journal_kind: string;
    account_code: string;
    direction: "debit" | "credit";
    amount: bigint;
    currency: string;
  }>;
}): DatabaseExecutor => ({
  query: async <T>(statement: string): Promise<T[]> => {
    if (statement.includes("from public.chain_deposits")) {
      return (input.deposits ?? []) as T[];
    }

    if (statement.includes("from public.withdrawals")) {
      return (input.withdrawals ?? []) as T[];
    }

    if (statement.includes("from public.ledger_journals")) {
      return (input.journalEntries ?? []) as T[];
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
      withdrawals: [
        {
          id: "wd-1",
          user_id: "u1",
          status: "completed",
          tx_hash: "0xwd1",
          amount: 40n,
          currency: "USDC",
          requested_journal_id: "jr-req-1",
          completed_journal_id: "jr-comp-1",
          failed_journal_id: null,
          processed_by: "admin-1",
          processed_at: "2026-01-01T00:00:00.000Z",
          failure_reason: null,
        },
      ],
      journalEntries: [
        {
          journal_id: "jr-req-1",
          journal_kind: "withdrawal_requested",
          account_code: "user:u1:funds:withdrawal_pending",
          direction: "debit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-req-1",
          journal_kind: "withdrawal_requested",
          account_code: "user:u1:funds:available",
          direction: "credit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-comp-1",
          journal_kind: "withdrawal_completed",
          account_code: "platform:withdrawals:base_usdc",
          direction: "debit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-comp-1",
          journal_kind: "withdrawal_completed",
          account_code: "user:u1:funds:withdrawal_pending",
          direction: "credit",
          amount: 40n,
          currency: "USDC",
        },
      ],
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
      withdrawals: [
        {
          id: "wd-1",
          user_id: "u1",
          status: "completed",
          tx_hash: "0xwd1",
          amount: 40n,
          currency: "USDC",
          requested_journal_id: "jr-req-1",
          completed_journal_id: "jr-comp-1",
          failed_journal_id: null,
          processed_by: "admin-1",
          processed_at: "2026-01-01T00:00:00.000Z",
          failure_reason: null,
        },
      ],
      journalEntries: [
        {
          journal_id: "jr-req-1",
          journal_kind: "withdrawal_requested",
          account_code: "user:u1:funds:withdrawal_pending",
          direction: "debit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-req-1",
          journal_kind: "withdrawal_requested",
          account_code: "user:u1:funds:available",
          direction: "credit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-comp-1",
          journal_kind: "withdrawal_completed",
          account_code: "platform:withdrawals:base_usdc",
          direction: "debit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-comp-1",
          journal_kind: "withdrawal_completed",
          account_code: "user:u1:funds:withdrawal_pending",
          direction: "credit",
          amount: 40n,
          currency: "USDC",
        },
      ],
    }),
    chainMonitor: createMonitor({
      "0xwd1": { state: "failed", txHash: "0xwd1", confirmations: 0 },
    }),
    minConfirmations: 12,
  });

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.check, "base_withdrawal_monitoring_state_mismatch");
});

test("flags failed withdrawal with incorrect reversal journal", async () => {
  const report = await runBaseTreasuryReconciliation({
    db: createDb({
      withdrawals: [
        {
          id: "wd-2",
          user_id: "u2",
          status: "failed",
          tx_hash: null,
          amount: 50n,
          currency: "USDC",
          requested_journal_id: "jr-req-2",
          completed_journal_id: null,
          failed_journal_id: "jr-fail-2",
          processed_by: "admin-2",
          processed_at: "2026-01-01T00:00:00.000Z",
          failure_reason: "rpc timeout",
        },
      ],
      journalEntries: [
        {
          journal_id: "jr-req-2",
          journal_kind: "withdrawal_requested",
          account_code: "user:u2:funds:withdrawal_pending",
          direction: "debit",
          amount: 50n,
          currency: "USDC",
        },
        {
          journal_id: "jr-req-2",
          journal_kind: "withdrawal_requested",
          account_code: "user:u2:funds:available",
          direction: "credit",
          amount: 50n,
          currency: "USDC",
        },
        {
          journal_id: "jr-fail-2",
          journal_kind: "withdrawal_failed",
          account_code: "user:u2:funds:available",
          direction: "debit",
          amount: 40n,
          currency: "USDC",
        },
        {
          journal_id: "jr-fail-2",
          journal_kind: "withdrawal_failed",
          account_code: "user:u2:funds:withdrawal_pending",
          direction: "credit",
          amount: 40n,
          currency: "USDC",
        },
      ],
    }),
    chainMonitor: createMonitor({}),
    minConfirmations: 12,
  });

  assert.ok(report.failures.length >= 1);
  assert.ok(report.failures.some((failure) => failure.check === "base_withdrawal_failed_reversal_mismatch"));
});
