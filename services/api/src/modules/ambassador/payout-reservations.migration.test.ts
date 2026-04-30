import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = () =>
  readFileSync(resolve(process.cwd(), "../../supabase/migrations/0034_reward_payout_reservations.sql"), "utf8");

test("reward payout reservation migration adds explicit reservation metadata", () => {
  const sql = migration();

  assert.match(sql, /add column if not exists reserved_by_payout_id uuid/i);
  assert.match(sql, /add column if not exists reserved_at timestamptz/i);
  assert.match(sql, /ambassador_reward_ledger_reserved_payout_fk/i);
  assert.match(sql, /references public\.ambassador_reward_payouts \(id\)/i);
  assert.match(sql, /ambassador_reward_ledger_reserved_payout_idx/i);
  assert.match(sql, /ambassador_reward_ledger_recipient_reserved_idx/i);
});

test("reward payout reservation migration keeps existing ledger reads compatible", () => {
  const sql = migration();

  assert.match(sql, /create or replace view public\.reward_ledger_entries/i);
  assert.match(sql, /recipient_user_id/);
  assert.match(sql, /source_trade_attribution_id/);
  assert.match(sql, /reward_type/);
  assert.match(sql, /amount_usdc_atoms/);
  assert.match(sql, /status/);
  assert.match(sql, /payable_at/);
  assert.match(sql, /paid_at/);
  assert.match(sql, /voided_at/);
  assert.match(sql, /approved_at/);
  assert.match(sql, /reserved_by_payout_id/);
  assert.match(sql, /reserved_at/);
});

test("reward payout reservation migration reserves payable rewards for open payouts", () => {
  const sql = migration();

  assert.match(sql, /create or replace function public\.rpc_apply_reward_payout_reservation/i);
  assert.match(sql, /new\.status = 'approved'/i);
  assert.match(sql, /new\.reserved_at = coalesce\(new\.reserved_at, new\.approved_at, now\(\)\)/i);
  assert.match(sql, /payout\.status in \('requested', 'approved'\)/i);
  assert.match(sql, /create trigger apply_reward_payout_reservation/i);
});

test("reward payout reservation migration releases failed or cancelled payouts", () => {
  const sql = migration();

  assert.match(sql, /create or replace function public\.rpc_close_reward_payout_reservation/i);
  assert.match(sql, /new\.status in \('failed', 'cancelled'\)/i);
  assert.match(sql, /old\.status in \('requested', 'approved'\)/i);
  assert.match(sql, /set status = 'payable'/i);
  assert.match(sql, /reserved_by_payout_id = null/i);
  assert.match(sql, /approved_at = null/i);
});

test("reward payout reservation migration marks reserved rewards paid only after payout is paid", () => {
  const sql = migration();

  assert.match(sql, /new\.status = 'paid'/i);
  assert.match(sql, /old\.status = 'approved'/i);
  assert.match(sql, /set status = 'paid'/i);
  assert.match(sql, /paid_at = coalesce\(new\.paid_at, now\(\)\)/i);
});
