import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import type { DatabaseClient, DatabaseTransaction } from "@bet/db";

import {
  normalizeBuilderFeeEvidence,
  runPolymarketBuilderAttributionSyncWithDependencies,
} from "./builder-attribution-sync";

const builderCode = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";
const userId = "11111111-1111-4111-8111-111111111111";
const referrerId = "22222222-2222-4222-8222-222222222222";
const feeImportId = "33333333-3333-4333-8333-333333333333";
const tradeAttributionId = "44444444-4444-4444-8444-444444444444";
const wallet = "0x1111111111111111111111111111111111111111";

const withEnv = async (env: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const createFakeDb = (candidateOverrides: Record<string, unknown> = {}) => {
  const queries: string[] = [];
  const imports: Array<Record<string, unknown>> = [];
  const rewards: Array<Record<string, unknown>> = [];
  let attribution: Record<string, unknown> | null = null;

  const tx: DatabaseTransaction = {
    async query<T>(statement: string, values: readonly unknown[] = []): Promise<T[]> {
      const sql = statement.replace(/\s+/g, " ").trim();
      queries.push(sql);

      if (/insert into public\.polymarket_builder_fee_reconciliation_runs/.test(sql)) {
        return [{ id: "55555555-5555-4555-8555-555555555555" }] as T[];
      }
      if (/update public\.polymarket_builder_fee_reconciliation_runs/.test(sql)) return [] as T[];

      if (/insert into public\.polymarket_builder_fee_imports/.test(sql)) {
        const key = String(values[2]);
        const duplicate = imports.find((row) => row.deterministic_import_key === key);
        if (duplicate) return [] as T[];
        const row = {
          id: feeImportId,
          source: values[0],
          external_fee_id: values[1],
          deterministic_import_key: values[2],
          external_order_id: values[3],
          external_trade_id: values[4],
          clob_order_id: values[5],
          market_external_id: values[6],
          condition_id: values[7],
          token_id: values[8],
          trader_wallet: values[9],
          builder_code: values[10],
          side: values[11],
          notional_amount_atoms: values[12],
          fee_amount_atoms: values[13],
          fee_asset: values[14],
          fee_bps: values[15],
          matched_at: values[16],
          raw_evidence_json: values[17],
          status: values[18],
          dispute_reason: values[19],
          imported_at: "2026-05-01T00:00:00.000Z",
        };
        imports.push(row);
        return [row] as T[];
      }
      if (/from public\.polymarket_builder_fee_imports where deterministic_import_key/.test(sql)) {
        const row = imports.find((item) => item.deterministic_import_key === values[0]);
        return (row ? [row] : []) as T[];
      }
      if (/update public\.polymarket_builder_fee_imports/.test(sql)) {
        const row = imports.find((item) => item.id === values[0]);
        if (row) {
          row.status = values[1];
          row.dispute_reason = values[2];
        }
        return [] as T[];
      }
      if (/from public\.polymarket_routed_order_audits audit/.test(sql)) {
        return [{
          id: "66666666-6666-4666-8666-666666666666",
          user_id: userId,
          market_external_id: "market-1",
          market_slug: "market-slug",
          token_id: "token-1",
          side: "BUY",
          notional_usdc_atoms: 100_000_000n,
          builder_code_attached: true,
          builder_code: builderCode,
          polymarket_order_id: "order-1",
          clob_order_id: "order-1",
          external_trade_id: "trade-1",
          trader_wallet: wallet,
          condition_id: "condition-1",
          referral_attribution_id: "77777777-7777-4777-8777-777777777777",
          linked_wallet_address: wallet,
          created_at: "2026-05-01T00:00:00.000Z",
          ...candidateOverrides,
        }] as T[];
      }
      if (/from public\.builder_trade_attributions where/.test(sql) && /source_builder_fee_import_id/.test(sql)) {
        return (attribution ? [attribution] : []) as T[];
      }
      if (/from public\.referral_attributions where referred_user_id/.test(sql)) {
        return [{
          id: "77777777-7777-4777-8777-777777777777",
          referred_user_id: userId,
          referrer_user_id: referrerId,
          ambassador_code: "DEMO",
          attributed_at: "2026-05-01T00:00:00.000Z",
          qualification_status: "qualified",
          rejection_reason: null,
        }] as T[];
      }
      if (/insert into public\.builder_trade_attributions/.test(sql)) {
        attribution = {
          id: tradeAttributionId,
          user_id: values[0],
          direct_referrer_user_id: values[1],
          polymarket_order_id: values[2],
          polymarket_trade_id: values[3],
          condition_id: values[4],
          market_slug: values[5],
          notional_usdc_atoms: values[6],
          builder_fee_usdc_atoms: values[7],
          status: values[8],
          raw_json: values[9],
          observed_at: "2026-05-01T00:00:00.000Z",
          confirmed_at: "2026-05-01T00:00:00.000Z",
        };
        return [attribution] as T[];
      }
      if (/from public\.builder_trade_attributions where id/.test(sql)) {
        return (attribution ? [attribution] : []) as T[];
      }
      if (/from public\.ambassador_reward_ledger where source_trade_attribution_id/.test(sql)) {
        return rewards as T[];
      }
      if (/insert into public\.ambassador_reward_ledger/.test(sql)) {
        rewards.push({
          id: `reward-${rewards.length}`,
          recipient_user_id: values[0] === "00000000-0000-0000-0000-000000000000" ? null : values[0],
          source_trade_attribution_id: values[2],
          reward_type: values[3],
          amount_usdc_atoms: values[4],
          status: "pending",
          created_at: "2026-05-01T00:00:00.000Z",
          payable_at: null,
          approved_at: null,
          paid_at: null,
          voided_at: null,
          void_reason: null,
        });
        return [] as T[];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };

  const db: DatabaseClient = {
    query: tx.query,
    async transaction<T>(callback: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
      return callback(tx);
    },
  };

  return { db, queries, imports, rewards };
};

test("Builder-fee evidence normalization creates stable idempotency keys", () => {
  const evidence = {
    feeId: "fee-1",
    orderId: "order-1",
    tradeId: "trade-1",
    tokenId: "token-1",
    traderWallet: wallet,
    builderCode,
    feeAmountAtoms: "1000000",
    notionalAmountAtoms: "100000000",
    feeBps: 100,
  };

  const first = normalizeBuilderFeeEvidence("official", evidence);
  const second = normalizeBuilderFeeEvidence("official", evidence);

  assert.equal(first.initialStatus, "imported");
  assert.equal(first.deterministicImportKey, second.deterministicImportKey);
});

test("malformed, zero, or negative Builder-fee evidence is disputed", () => {
  assert.equal(normalizeBuilderFeeEvidence("official", { builderCode, feeAmountAtoms: "0", orderId: "order-1" }).initialStatus, "disputed");
  assert.equal(normalizeBuilderFeeEvidence("official", { builderCode, feeAmountAtoms: "-1", orderId: "order-1" }).initialStatus, "disputed");
  assert.match(
    normalizeBuilderFeeEvidence("official", { feeAmountAtoms: "100" }).disputeReason ?? "",
    /builder_code_missing|external_order_or_trade_id_missing/,
  );
});

test("missing official Builder-fee source is a no-op and creates no rewards", async () => {
  const fake = createFakeDb();
  await withEnv({
    POLYMARKET_BUILDER_ATTRIBUTION_SYNC_ENABLED: "true",
    POLYMARKET_BUILDER_FEE_EVIDENCE_URL: undefined,
  }, async () => {
    const result = await runPolymarketBuilderAttributionSyncWithDependencies({ db: fake.db, adapter: null });
    assert.equal(result.status, "pending_config");
    assert.equal(result.confirmedAttributions, 0);
    assert.equal(result.rewardsCreated, 0);
    assert.equal(fake.rewards.length, 0);
  });
});

test("exact order and trade match confirms once and creates reward ledger rows once", async () => {
  const fake = createFakeDb();
  const evidence = {
    feeId: "fee-1",
    orderId: "order-1",
    tradeId: "trade-1",
    marketId: "market-1",
    conditionId: "condition-1",
    tokenId: "token-1",
    traderWallet: wallet,
    builderCode,
    feeAmountAtoms: "1000000",
    notionalAmountAtoms: "100000000",
    feeBps: 100,
    matchedAt: "2026-05-01T00:01:00.000Z",
  };

  await withEnv({
    POLYMARKET_BUILDER_ATTRIBUTION_SYNC_ENABLED: "true",
    AMBASSADOR_REWARDS_ENABLED: "true",
    AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED: "false",
    AMBASSADOR_AUTO_PAYOUT_ENABLED: "false",
    POLY_BUILDER_CODE: builderCode,
  }, async () => {
    const adapter = { source: "official", loadEvidence: async () => [evidence, evidence] };
    const result = await runPolymarketBuilderAttributionSyncWithDependencies({ db: fake.db, adapter });
    assert.equal(result.status, "completed");
    assert.equal(result.importedCount, 1);
    assert.equal(result.confirmedAttributions, 1);
    assert.equal(fake.imports.length, 1);
    assert.equal(fake.rewards.length, 3);
  });
});

test("wallet, builder code, and market/token mismatches dispute evidence", async () => {
  const cases = [
    { override: { trader_wallet: "0x2222222222222222222222222222222222222222" }, reason: /trader_wallet_mismatch/ },
    { override: { builder_code: "0x2b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca" }, reason: /builder_code_mismatches_routed_audit/ },
    { override: { token_id: "token-2" }, reason: /token_id_mismatch/ },
  ];

  for (const item of cases) {
    const fake = createFakeDb(item.override);
    await withEnv({
      POLYMARKET_BUILDER_ATTRIBUTION_SYNC_ENABLED: "true",
      AMBASSADOR_REWARDS_ENABLED: "true",
      AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED: "false",
      AMBASSADOR_AUTO_PAYOUT_ENABLED: "false",
      POLY_BUILDER_CODE: builderCode,
    }, async () => {
      const adapter = {
        source: "official",
        loadEvidence: async () => [{
          feeId: crypto.randomUUID(),
          orderId: "order-1",
          tradeId: "trade-1",
          marketId: "market-1",
          conditionId: "condition-1",
          tokenId: "token-1",
          traderWallet: wallet,
          builderCode,
          feeAmountAtoms: "1000000",
          notionalAmountAtoms: "100000000",
          feeBps: 100,
          matchedAt: "2026-05-01T00:01:00.000Z",
        }],
      };
      const result = await runPolymarketBuilderAttributionSyncWithDependencies({ db: fake.db, adapter });
      assert.equal(result.confirmedAttributions, 0);
      assert.equal(result.disputedCount, 1);
      assert.match(String(fake.imports[0]?.dispute_reason ?? ""), item.reason);
      assert.equal(fake.rewards.length, 0);
    });
  }
});
