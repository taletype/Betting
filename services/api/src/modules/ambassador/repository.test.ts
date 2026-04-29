import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ambassadorRewardTypes,
  calculateRewardLedgerDrafts,
  decideReferralAttribution,
  generateAmbassadorCode,
  getAmbassadorRewardsConfig,
  validateRewardShareConfig,
  type AmbassadorCodeRecord,
  type AmbassadorRewardsConfig,
  type ReferralAttributionRecord,
} from "./repository";

const enabledConfig: AmbassadorRewardsConfig = {
  enabled: true,
  platformShareBps: 6000,
  directReferrerShareBps: 3000,
  traderCashbackShareBps: 1000,
  minPayoutUsdcAtoms: 0n,
  autoCalculationEnabled: true,
  autoPayoutEnabled: false,
};

const code = (overrides: Partial<AmbassadorCodeRecord> = {}): AmbassadorCodeRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  code: "DEMO1001",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  status: "active",
  createdAt: "2026-04-01T00:00:00.000Z",
  disabledAt: null,
  ...overrides,
});

const attribution = (overrides: Partial<ReferralAttributionRecord> = {}): ReferralAttributionRecord => ({
  id: "33333333-3333-4333-8333-333333333333",
  referredUserId: "44444444-4444-4444-8444-444444444444",
  referrerUserId: "22222222-2222-4222-8222-222222222222",
  ambassadorCode: "DEMO1001",
  attributedAt: "2026-04-01T00:00:00.000Z",
  qualificationStatus: "pending",
  rejectionReason: null,
  ...overrides,
});

test("ambassador code generation creates usable short codes", () => {
  assert.match(generateAmbassadorCode(), /^[0-9A-F]{8}$/);
});

test("valid direct referral creates a first-time attribution decision", () => {
  const decision = decideReferralAttribution({
    referredUserId: "44444444-4444-4444-8444-444444444444",
    existingAttribution: null,
    codeRecord: code(),
  });

  assert.deepEqual(decision, {
    action: "create",
    referrerUserId: "22222222-2222-4222-8222-222222222222",
    ambassadorCode: "DEMO1001",
  });
});

test("self-referral is rejected", () => {
  assert.throws(
    () => decideReferralAttribution({
      referredUserId: "22222222-2222-4222-8222-222222222222",
      existingAttribution: null,
      codeRecord: code(),
    }),
    /self-referrals are not allowed/,
  );
});

test("disabled ambassador code is rejected", () => {
  assert.throws(
    () => decideReferralAttribution({
      referredUserId: "44444444-4444-4444-8444-444444444444",
      existingAttribution: null,
      codeRecord: code({ status: "disabled", disabledAt: "2026-04-02T00:00:00.000Z" }),
    }),
    /disabled/,
  );
});

test("first attribution wins unless an admin override path is used", () => {
  const existing = attribution();
  const decision = decideReferralAttribution({
    referredUserId: existing.referredUserId,
    existingAttribution: existing,
    codeRecord: code({ ownerUserId: "55555555-5555-4555-8555-555555555555", code: "OTHER001" }),
  });

  assert.deepEqual(decision, { action: "existing", attribution: existing });
});

test("direct reward accounting uses configured shares", () => {
  const drafts = calculateRewardLedgerDrafts({
    builderFeeUsdcAtoms: 1_000_000n,
    traderUserId: "44444444-4444-4444-8444-444444444444",
    directReferrerUserId: "22222222-2222-4222-8222-222222222222",
    config: enabledConfig,
  });

  assert.equal(drafts.find((draft) => draft.rewardType === "platform_revenue")?.amountUsdcAtoms, 600_000n);
  assert.equal(drafts.find((draft) => draft.rewardType === "direct_referrer_commission")?.amountUsdcAtoms, 300_000n);
  assert.equal(drafts.find((draft) => draft.rewardType === "trader_cashback")?.amountUsdcAtoms, 100_000n);
});

test("no referrer sends the referrer share to platform revenue", () => {
  const drafts = calculateRewardLedgerDrafts({
    builderFeeUsdcAtoms: 1_000_000n,
    traderUserId: "44444444-4444-4444-8444-444444444444",
    directReferrerUserId: null,
    config: enabledConfig,
  });

  assert.equal(drafts.find((draft) => draft.rewardType === "platform_revenue")?.amountUsdcAtoms, 900_000n);
  assert.equal(drafts.find((draft) => draft.rewardType === "trader_cashback")?.amountUsdcAtoms, 100_000n);
  assert.equal(drafts.some((draft) => draft.rewardType === "direct_referrer_commission"), false);
});

test("no second-tier reward type is created", () => {
  const unexpectedRewardTypes = ambassadorRewardTypes.filter((rewardType) =>
    /recruit|generation|tier|ancestor|recursive|downline|second/i.test(rewardType),
  );

  assert.deepEqual(unexpectedRewardTypes, []);
});

test("reward ledger entries are created as pending records", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.match(source, /status,\s*created_at/);
  assert.match(source, /'pending'/);
  assert.match(source, /builder trade attribution must be confirmed before rewards become payable/);
});

test("payout workflow enforces threshold and admin approval before paid", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.match(source, /payable rewards are below the minimum payout threshold/);
  assert.match(source, /status = 'requested'/);
  assert.match(source, /status = 'approved'/);
  assert.match(source, /payout requires admin approval before it can be marked paid/);
});

test("reward shares must sum to 10000 bps", () => {
  assert.doesNotThrow(() => validateRewardShareConfig(enabledConfig));
  assert.throws(
    () => validateRewardShareConfig({ ...enabledConfig, platformShareBps: 5000 }),
    /sum to 10000/,
  );
  assert.throws(
    () => validateRewardShareConfig({ ...enabledConfig, enabled: false, autoPayoutEnabled: true }),
    /cannot be true/,
  );
});

test("auto payout defaults false", () => {
  const previous = process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  try {
    assert.equal(getAmbassadorRewardsConfig().autoPayoutEnabled, false);
  } finally {
    if (previous === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = previous;
  }
});

test("ambassador migration contains direct-only reward tables", () => {
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0021_ambassador_rewards.sql"), "utf8");

  assert.match(migration, /create table if not exists public\.ambassador_codes/i);
  assert.match(migration, /create table if not exists public\.referral_attributions/i);
  assert.match(migration, /create table if not exists public\.ambassador_reward_ledger/i);
  assert.doesNotMatch(migration, /parent_referrer_id|sponsor_tree|ancestor|closure|nested|binary|matrix|spillover|level_[0-9]|team_captain|with recursive|downline|second_level/i);
});

test("reward accounting module does not import internal balance mutation modules", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.doesNotMatch(source, /@bet\/ledger/);
  assert.doesNotMatch(source, /@bet\/trading/);
  assert.doesNotMatch(source, /ledger_journals|ledger_entries|balanceDeltas|rpc_place_order/);
});
