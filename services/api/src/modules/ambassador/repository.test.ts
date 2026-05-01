import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ambassadorRewardTypes,
  ambassadorPayoutRiskReviewRequiredCode,
  ambassadorPayoutRiskReviewRequiredMessage,
  approveRewardPayout,
  assertPayoutApprovalRiskClear,
  calculateRewardLedgerDrafts,
  assertValidPayoutTxHash,
  buildPolygonTxUrl,
  decideAutoPayoutRequest,
  decideReferralAttribution,
  generateAmbassadorCode,
  getAmbassadorRewardsConfig,
  normalizePayoutWalletAddress,
  validateRewardShareConfig,
  type AmbassadorCodeRecord,
  type AmbassadorRewardPayoutRecord,
  type AmbassadorRiskStatus,
  type AmbassadorRewardsConfig,
  type ReferralAttributionRecord,
} from "./repository";
import type { DatabaseTransaction } from "@bet/db";

const enabledConfig: AmbassadorRewardsConfig = {
  enabled: true,
  platformShareBps: 6000,
  directReferrerShareBps: 3000,
  traderCashbackShareBps: 1000,
  minPayoutUsdcAtoms: 0n,
  autoCalculationEnabled: true,
  autoPayoutRequestEnabled: false,
  autoPayoutEnabled: false,
  payoutChain: "polygon",
  payoutChainId: 137,
  payoutAsset: "pUSD",
  payoutAssetDecimals: 6,
  polygonExplorerUrl: "https://polygonscan.com",
  polygonPayoutTreasuryAddress: "placeholder",
  polygonPusdAddress: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
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

const payoutId = "55555555-5555-4555-8555-555555555555";
const payoutRecipientId = "66666666-6666-4666-8666-666666666666";
const payoutReviewerId = "77777777-7777-4777-8777-777777777777";

const createPayoutApprovalFakeRepository = (riskStatus: AmbassadorRiskStatus) => {
  let payoutStatus: "requested" | "approved" = "requested";
  let ledgerStatus: "approved" = "approved";
  const queries: string[] = [];
  const payoutRow = () => ({
    id: payoutId,
    recipient_user_id: payoutRecipientId,
    amount_usdc_atoms: 500_000n,
    status: payoutStatus,
    destination_type: "wallet",
    destination_value: "0x1111111111111111111111111111111111111111",
    payout_chain: "polygon",
    payout_chain_id: 137,
    payout_asset: "pUSD",
    payout_asset_decimals: 6,
    asset_contract_address: enabledConfig.polygonPusdAddress,
    reviewed_by: payoutStatus === "approved" ? payoutReviewerId : null,
    reviewed_at: payoutStatus === "approved" ? "2026-04-01T00:00:00.000Z" : null,
    paid_at: null,
    tx_hash: null,
    notes: "reviewed",
    created_at: "2026-04-01T00:00:00.000Z",
  });

  const transaction: DatabaseTransaction = {
    async query<T>(statement: string): Promise<T[]> {
      const normalized = statement.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (/select recipient_user_id, amount_usdc_atoms, status from public\.ambassador_reward_payouts/.test(normalized)) {
        return [{ recipient_user_id: payoutRecipientId, amount_usdc_atoms: 500_000n, status: payoutStatus }] as T[];
      }

      if (/select recipient_user_id, status from public\.ambassador_reward_payouts/.test(normalized)) {
        return [{ recipient_user_id: payoutRecipientId, status: payoutStatus }] as T[];
      }

      if (/from public\.ambassador_reward_ledger where recipient_user_id/.test(normalized) && /status = 'approved'/.test(normalized)) {
        return [{ amount: ledgerStatus === "approved" ? 500_000n : 0n }] as T[];
      }

      if (/from public\.ambassador_risk_flags flag/.test(normalized)) {
        assert.match(normalized, /flag\.status = 'open'/);
        assert.match(normalized, /flag\.severity = 'high'/);
        return riskStatus === "open" ? [{ id: "88888888-8888-4888-8888-888888888888" }] as T[] : [];
      }

      if (/update public\.ambassador_reward_payouts set status = 'approved'/.test(normalized)) {
        if (payoutStatus !== "requested") return [];
        payoutStatus = "approved";
        return [payoutRow()] as T[];
      }

      throw new Error(`unexpected fake repository query: ${normalized}`);
    },
  };

  return {
    transaction,
    queries,
    get payoutStatus() {
      return payoutStatus;
    },
    get ledgerStatus() {
      return ledgerStatus;
    },
  };
};

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
  const handlers = readFileSync(resolve(process.cwd(), "src/modules/ambassador/handlers.ts"), "utf8");

  assert.match(source, /status,\s*created_at/);
  assert.match(source, /'pending'/);
  assert.match(source, /builder trade attribution must be confirmed before rewards become payable/);
  assert.match(handlers, /tradeAttribution\.status === "confirmed"/);
  assert.match(handlers, /accountConfirmedBuilderTradeRewards/);
  assert.doesNotMatch(handlers, /ledger = await markRewardsPayable\(transaction, tradeAttribution\.id\)/);
});

test("unconfirmed Builder attribution does not create payable rewards", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.match(source, /if \(!trade \|\| trade\.status !== "confirmed"\)/);
  assert.match(source, /builder trade attribution must be confirmed before rewards become payable/);
  assert.match(source, /const status = input\.status \?\? "pending"/);
  assert.match(source, /case when \$9 = 'confirmed' then now\(\) else null end/);
});

test("payout workflow enforces threshold and admin approval before paid", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");
  const handlers = readFileSync(resolve(process.cwd(), "src/modules/ambassador/handlers.ts"), "utf8");

  assert.match(source, /payable rewards are below the minimum payout threshold/);
  assert.match(source, /status = 'requested'/);
  assert.match(source, /'requested',\s*\$3,/);
  assert.match(source, /status = 'approved'/);
  assert.match(source, /ambassador_reward_ledger[\s\S]+set status = 'approved'/);
  assert.match(handlers, /from public\.ambassador_reward_ledger[\s\S]+status = 'payable'[\s\S]+for update/);
  assert.match(handlers, /payout request must reserve the exact payable reward amount/);
  assert.match(handlers, /findOpenRewardPayoutForRecipient/);
  assert.match(source, /wallet payout tx hash must be a 32-byte 0x hash/);
  assert.match(source, /recipient already has an open reward payout request/);
  assert.match(source, /payout requires admin approval before it can be marked paid/);
});

test("payout state changes are isolated to rows reserved by that payout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");
  const webFallback = readFileSync(resolve(process.cwd(), "../../apps/web/src/app/api/_shared/ambassador.ts"), "utf8");

  for (const moduleSource of [source, webFallback]) {
    assert.match(moduleSource, /reserved_by_payout_id = \$2::uuid/);
    assert.match(moduleSource, /where reserved_by_payout_id = \$1::uuid[\s\S]+and status = 'approved'/);
    assert.match(moduleSource, /reserved_by_payout_id = null/);
    assert.doesNotMatch(
      moduleSource,
      /set status = 'paid'[\s\S]{0,180}where recipient_user_id = \$1::uuid[\s\S]{0,80}and status = 'approved'/,
    );
    assert.doesNotMatch(
      moduleSource,
      /set status = 'payable'[\s\S]{0,220}where recipient_user_id = \$1::uuid[\s\S]{0,80}and status = 'approved'/,
    );
  }
});

test("Builder placeholder admin route cannot confirm fees or create rewards", () => {
  const handlers = readFileSync(resolve(process.cwd(), "src/modules/ambassador/handlers.ts"), "utf8");

  assert.match(handlers, /source: "admin_placeholder_unconfirmed"/);
  assert.match(handlers, /const safeStatus = input\.status === "void" \? "void" : "pending"/);
  assert.doesNotMatch(handlers, /source: "admin_mock"/);
  assert.doesNotMatch(handlers, /tradeAttribution\.status === "confirmed"[\s\S]+accountConfirmedBuilderTradeRewards/);
});

test("open high-risk flag blocks payout approval with safe error", async () => {
  const transaction = {
    query: async <T>() => [{ id: "99999999-9999-4999-8999-999999999999" } as T],
  } satisfies DatabaseTransaction;

  await assert.rejects(
    () => assertPayoutApprovalRiskClear(transaction, "55555555-5555-4555-8555-555555555555"),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : "", ambassadorPayoutRiskReviewRequiredMessage);
      assert.equal((error as { code?: string }).code, ambassadorPayoutRiskReviewRequiredCode);
      return true;
    },
  );
});

test("reviewed and dismissed high-risk flags do not block payout approval", async () => {
  const transaction = {
    query: async (statement: string) => {
      assert.match(statement, /flag\.status = 'open'/);
      assert.match(statement, /flag\.severity = 'high'/);
      return [];
    },
  } satisfies DatabaseTransaction;

  await assert.doesNotReject(() => assertPayoutApprovalRiskClear(transaction, "55555555-5555-4555-8555-555555555555"));
});

test("payout approval uses repository risk flags to block only open high-severity flags", async () => {
  const openRiskRepo = createPayoutApprovalFakeRepository("open");
  await assert.rejects(
    () => approveRewardPayout(openRiskRepo.transaction, { payoutId, reviewedBy: payoutReviewerId, notes: "reviewed" }),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : "", ambassadorPayoutRiskReviewRequiredMessage);
      assert.equal((error as { code?: string }).code, ambassadorPayoutRiskReviewRequiredCode);
      return true;
    },
  );
  assert.equal(openRiskRepo.payoutStatus, "requested");
  assert.equal(openRiskRepo.ledgerStatus, "approved");
  assert.ok(openRiskRepo.queries.some((query) => /from public\.ambassador_risk_flags flag/.test(query)));

  for (const riskStatus of ["reviewed", "dismissed"] as const) {
    const repo = createPayoutApprovalFakeRepository(riskStatus);
    const payout = await approveRewardPayout(repo.transaction, { payoutId, reviewedBy: payoutReviewerId, notes: "reviewed" });

    assert.equal(payout.status, "approved");
    assert.equal(payout.reviewedBy, payoutReviewerId);
    assert.equal(repo.payoutStatus, "approved");
    assert.equal(repo.ledgerStatus, "approved");
    assert.ok(repo.queries.some((query) => /flag\.status = 'open'/.test(query)));
  }
});

test("payout risk guard checks recipient, payout, referral, and trade links", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.match(source, /flag\.user_id = payout\.recipient_user_id/);
  assert.match(source, /flag\.payout_id = payout\.id/);
  assert.match(source, /flag\.referral_attribution_id in \(select id from related_referral_attributions\)/);
  assert.match(source, /flag\.trade_attribution_id in \(select id from related_trade_attributions\)/);
});

test("reward automation has no crypto transfer broadcast path", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.doesNotMatch(source, /privateKey|mnemonic|sendTransaction|broadcast|walletClient|createWalletClient|signer/i);
});

test("reward shares must sum to 10000 bps", () => {
  assert.doesNotThrow(() => validateRewardShareConfig(enabledConfig));
  assert.throws(
    () => validateRewardShareConfig({ ...enabledConfig, platformShareBps: 5000 }),
    /sum to 10000/,
  );
  assert.throws(
    () => validateRewardShareConfig({ ...enabledConfig, enabled: true, autoPayoutEnabled: true }),
    /must remain false/,
  );
});

test("auto payout and auto payout request default false", () => {
  const previous = process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  const previousRequest = process.env.AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED;
  delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  delete process.env.AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED;
  try {
    assert.equal(getAmbassadorRewardsConfig().autoPayoutEnabled, false);
    assert.equal(getAmbassadorRewardsConfig().autoPayoutRequestEnabled, false);
  } finally {
    if (previous === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = previous;
    if (previousRequest === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED = previousRequest;
  }
});

test("AMBASSADOR_AUTO_PAYOUT_ENABLED=true is rejected by runtime config", () => {
  const previous = process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = "true";
  try {
    assert.throws(() => getAmbassadorRewardsConfig(), /AMBASSADOR_AUTO_PAYOUT_ENABLED must remain false/);
  } finally {
    if (previous === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = previous;
  }
});

test("auto payout request is created only when threshold and Polygon wallet checks pass", () => {
  const config = { ...enabledConfig, minPayoutUsdcAtoms: 500_000n, autoPayoutRequestEnabled: true };
  const payoutWallet = {
    chain: "polygon",
    walletAddress: "0x1111111111111111111111111111111111111111",
    assetPreference: "pUSD",
  };

  assert.deepEqual(
    decideAutoPayoutRequest({ config, payableBalance: 499_999n, payoutWallet, openPayout: null }),
    { action: "below_threshold" },
  );
  assert.deepEqual(
    decideAutoPayoutRequest({ config, payableBalance: 500_000n, payoutWallet: null, openPayout: null }),
    { action: "missing_wallet" },
  );
  assert.deepEqual(
    decideAutoPayoutRequest({
      config,
      payableBalance: 500_000n,
      payoutWallet: { ...payoutWallet, walletAddress: "not-an-address" },
      openPayout: null,
    }),
    { action: "invalid_wallet" },
  );
  assert.deepEqual(
    decideAutoPayoutRequest({
      config,
      payableBalance: 500_000n,
      payoutWallet,
      openPayout: {
        id: "55555555-5555-4555-8555-555555555555",
        recipientUserId: "66666666-6666-4666-8666-666666666666",
        amountUsdcAtoms: 500_000n,
        status: "requested",
        destinationType: "wallet",
        destinationValue: payoutWallet.walletAddress,
        payoutChain: "polygon",
        payoutChainId: 137,
        payoutAsset: "pUSD",
        payoutAssetDecimals: 6,
        assetContractAddress: enabledConfig.polygonPusdAddress,
        reviewedBy: null,
        reviewedAt: null,
        paidAt: null,
        txHash: null,
        notes: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      } satisfies AmbassadorRewardPayoutRecord,
    }),
    { action: "duplicate_open_payout" },
  );
  assert.deepEqual(
    decideAutoPayoutRequest({ config, payableBalance: 500_000n, payoutWallet, openPayout: null }),
    {
      action: "create",
      amountUsdcAtoms: 500_000n,
      destinationValue: "0x1111111111111111111111111111111111111111",
    },
  );
});

test("payout wallet and paid tx hash validation enforce Polygon wallet payouts", () => {
  assert.equal(
    normalizePayoutWalletAddress("0x1111111111111111111111111111111111111111"),
    "0x1111111111111111111111111111111111111111",
  );
  assert.throws(() => normalizePayoutWalletAddress("0x1234"), /valid 0x EVM address/);
  assert.equal(
    assertValidPayoutTxHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.throws(() => assertValidPayoutTxHash(null), /32-byte 0x hash/);
  assert.equal(
    buildPolygonTxUrl("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    "https://polygonscan.com/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
});

test("ambassador migration contains direct-only reward tables", () => {
  const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0021_ambassador_rewards.sql"), "utf8");

  assert.match(migration, /create table if not exists public\.ambassador_codes/i);
  assert.match(migration, /create table if not exists public\.referral_attributions/i);
  assert.match(migration, /create table if not exists public\.ambassador_reward_ledger/i);
  assert.match(migration, /create table if not exists public\.ambassador_payout_wallets/i);
  assert.match(migration, /ambassador_reward_payouts_recipient_open_idx/i);
  assert.match(migration, /tx_hash ~\* '\^0x\[0-9a-f\]\{64\}\$'/i);
  assert.doesNotMatch(migration, /parent_referrer_id|sponsor_tree|ancestor|closure|nested|binary|matrix|spillover|level_[0-9]|team_captain|with recursive|downline|second_level/i);
});

test("reward accounting module does not import internal balance mutation modules", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");

  assert.doesNotMatch(source, /@bet\/ledger/);
  assert.doesNotMatch(source, /@bet\/trading/);
  assert.doesNotMatch(source, /ledger_journals|ledger_entries|balanceDeltas|rpc_place_order/);
});