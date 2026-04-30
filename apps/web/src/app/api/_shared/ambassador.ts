import crypto from "node:crypto";

import { createDatabaseClient, type DatabaseExecutor, type DatabaseTransaction } from "@bet/db";
import { isAddress } from "ethers";

const zeroUuid = "00000000-0000-0000-0000-000000000000";
const platformRecipientUuid = zeroUuid;
const defaultPolygonPusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

type RewardStatus = "pending" | "payable" | "approved" | "paid" | "void";
type TradeStatus = "pending" | "confirmed" | "void";
type PayoutStatus = "requested" | "approved" | "paid" | "failed" | "cancelled";
type RiskSeverity = "low" | "medium" | "high";
type RiskStatus = "open" | "reviewed" | "dismissed";

const getDb = () => createDatabaseClient();

const toIso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const inviteUrlForCode = (code: string): string => {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  return `${base}/?ref=${encodeURIComponent(code)}`;
};

const parseMinPayout = (): bigint => BigInt(process.env.AMBASSADOR_MIN_PAYOUT_USDC_ATOMS?.trim() || "0");

const parseBooleanEnv = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${name} must be a boolean flag`);
};

const parseIntegerEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
};

const parseStringEnv = (name: string, defaultValue: string): string => process.env[name]?.trim() || defaultValue;

const normalizePayoutWalletAddress = (address: string): string => {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized) || !isAddress(normalized)) {
    throw new Error("Polygon payout wallet must be a valid 0x EVM address");
  }
  return normalized;
};

const assertValidPayoutTxHash = (txHash: string | null | undefined): string => {
  const normalized = txHash?.trim().toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw new Error("wallet payout tx hash must be a 32-byte 0x hash");
  return normalized;
};

const getRewardConfig = () => {
  const config = {
    enabled: parseBooleanEnv("AMBASSADOR_REWARDS_ENABLED", false),
    platformShareBps: parseIntegerEnv("AMBASSADOR_PLATFORM_SHARE_BPS", 6000),
    directReferrerShareBps: parseIntegerEnv("AMBASSADOR_DIRECT_REFERRER_SHARE_BPS", 3000),
    traderCashbackShareBps: parseIntegerEnv("AMBASSADOR_TRADER_CASHBACK_SHARE_BPS", 1000),
    autoCalculationEnabled: parseBooleanEnv("AMBASSADOR_AUTO_CALCULATION_ENABLED", true),
    autoPayoutRequestEnabled: parseBooleanEnv("AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED", false),
    autoPayoutEnabled: parseBooleanEnv("AMBASSADOR_AUTO_PAYOUT_ENABLED", false),
    payoutChain: parseStringEnv("PAYOUT_CHAIN", "polygon"),
    payoutChainId: parseIntegerEnv("PAYOUT_CHAIN_ID", 137),
    payoutAsset: parseStringEnv("PAYOUT_ASSET", "pUSD"),
    payoutAssetDecimals: parseIntegerEnv("PAYOUT_ASSET_DECIMALS", 6),
    polygonExplorerUrl: parseStringEnv("POLYGON_EXPLORER_URL", "https://polygonscan.com"),
    polygonPayoutTreasuryAddress: parseStringEnv("POLYGON_PAYOUT_TREASURY_ADDRESS", "placeholder"),
    polygonPusdAddress: parseStringEnv("POLYGON_PUSD_ADDRESS", defaultPolygonPusdAddress),
  };
  const total = config.platformShareBps + config.directReferrerShareBps + config.traderCashbackShareBps;
  if (total !== 10000) throw new Error("ambassador reward shares must sum to 10000 bps");
  if (config.autoPayoutEnabled) throw new Error("AMBASSADOR_AUTO_PAYOUT_ENABLED must remain false; automatic crypto payouts are not supported");
  if (config.payoutChain !== "polygon") throw new Error("PAYOUT_CHAIN must be polygon");
  if (config.payoutChainId !== 137) throw new Error("PAYOUT_CHAIN_ID must be 137 for Polygon payouts");
  if (config.payoutAsset !== "pUSD") throw new Error("PAYOUT_ASSET must be pUSD");
  if (config.payoutAssetDecimals !== 6) throw new Error("PAYOUT_ASSET_DECIMALS must be 6 for pUSD");
  if (config.polygonPayoutTreasuryAddress !== "placeholder" && !isAddress(config.polygonPayoutTreasuryAddress)) {
    throw new Error("POLYGON_PAYOUT_TREASURY_ADDRESS must be placeholder or a valid EVM address");
  }
  if (!isAddress(config.polygonPusdAddress)) throw new Error("POLYGON_PUSD_ADDRESS must be a valid EVM address");
  return config;
};

const calculateBps = (amount: bigint, bps: number): bigint => (amount * BigInt(bps)) / 10000n;

const readCodeByCode = async (transaction: DatabaseExecutor, code: string) => {
  const [row] = await transaction.query<{
    id: string;
    code: string;
    owner_user_id: string;
    status: "active" | "disabled";
    created_at: Date | string;
    disabled_at: Date | string | null;
  }>(
    `select id, code, owner_user_id, status, created_at, disabled_at from public.ambassador_codes where upper(code) = upper($1) limit 1`,
    [code.trim()],
  );
  return row ?? null;
};

const insertRiskFlag = async (
  executor: DatabaseExecutor,
  input: {
    userId?: string | null;
    referralAttributionId?: string | null;
    tradeAttributionId?: string | null;
    payoutId?: string | null;
    severity: RiskSeverity;
    reasonCode: string;
    details?: Record<string, unknown>;
  },
) => {
  await executor.query(
    `
      insert into public.ambassador_risk_flags (
        user_id, referral_attribution_id, trade_attribution_id, payout_id, severity, reason_code, details, status, created_at
      ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb, 'open', now())
    `,
    [
      input.userId ?? null,
      input.referralAttributionId ?? null,
      input.tradeAttributionId ?? null,
      input.payoutId ?? null,
      input.severity,
      input.reasonCode,
      JSON.stringify(input.details ?? {}),
    ],
  );
};

const mapCode = (row: {
  id: string;
  code: string;
  owner_user_id: string;
  status: "active" | "disabled";
  created_at: Date | string;
  disabled_at: Date | string | null;
}) => ({
  id: row.id,
  code: row.code,
  ownerUserId: row.owner_user_id,
  status: row.status,
  createdAt: toIso(row.created_at),
  disabledAt: toIso(row.disabled_at),
});

const ensureAmbassadorCode = async (userId: string) => {
  const db = getDb();
  const [existing] = await db.query<{
    id: string;
    code: string;
    owner_user_id: string;
    status: "active" | "disabled";
    created_at: Date | string;
    disabled_at: Date | string | null;
  }>(
    `select id, code, owner_user_id, status, created_at, disabled_at from public.ambassador_codes where owner_user_id = $1::uuid and status = 'active' order by created_at asc limit 1`,
    [userId],
  );
  if (existing) return { ...mapCode(existing), inviteUrl: inviteUrlForCode(existing.code) };

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const [inserted] = await db.query<{
    id: string;
    code: string;
    owner_user_id: string;
    status: "active" | "disabled";
    created_at: Date | string;
    disabled_at: Date | string | null;
  }>(
    `insert into public.ambassador_codes (code, owner_user_id, status, created_at, disabled_at) values ($1, $2::uuid, 'active', now(), null) returning id, code, owner_user_id, status, created_at, disabled_at`,
    [code, userId],
  );
  if (!inserted) throw new Error("failed to create ambassador code");
  return { ...mapCode(inserted), inviteUrl: inviteUrlForCode(inserted.code) };
};

export const readAmbassadorDashboardDb = async (userId: string) => {
  const db = getDb();
  const [ambassadorCode, attributionRows, directRows, rewardRows, ledgerRows, payoutRows] = await Promise.all([
    ensureAmbassadorCode(userId),
    db.query<{
      id: string;
      referred_user_id: string;
      referrer_user_id: string;
      ambassador_code: string;
      attributed_at: Date | string;
      qualification_status: "pending" | "qualified" | "rejected";
      rejection_reason: string | null;
    }>(
      `select id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason from public.referral_attributions where referred_user_id = $1::uuid limit 1`,
      [userId],
    ),
    db.query<{
      user_id: string;
      username: string | null;
      display_name: string | null;
      attributed_at: Date | string;
      qualification_status: "pending" | "qualified" | "rejected";
      trading_volume_usdc_atoms: bigint;
    }>(
      `
        select profile.id as user_id, profile.username, profile.display_name, attribution.attributed_at, attribution.qualification_status,
          coalesce(sum(trade.notional_usdc_atoms), 0::bigint) as trading_volume_usdc_atoms
        from public.referral_attributions attribution
        join public.profiles profile on profile.id = attribution.referred_user_id
        left join public.builder_trade_attributions trade
          on trade.user_id = attribution.referred_user_id
         and trade.direct_referrer_user_id = attribution.referrer_user_id
         and trade.status = 'confirmed'
        where attribution.referrer_user_id = $1::uuid
        group by profile.id, profile.username, profile.display_name, attribution.attributed_at, attribution.qualification_status
        order by attribution.attributed_at desc
      `,
      [userId],
    ),
    db.query<{ status: "pending" | "payable" | "approved" | "paid" | "void"; amount: bigint }>(
      `select status, coalesce(sum(amount_usdc_atoms), 0::bigint) as amount from public.ambassador_reward_ledger where recipient_user_id = $1::uuid group by status`,
      [userId],
    ),
    db.query<{
      id: string;
      recipient_user_id: string | null;
      source_trade_attribution_id: string;
      reward_type: "platform_revenue" | "direct_referrer_commission" | "trader_cashback";
      amount_usdc_atoms: bigint;
      status: "pending" | "payable" | "approved" | "paid" | "void";
      created_at: Date | string;
      payable_at: Date | string | null;
      approved_at: Date | string | null;
      paid_at: Date | string | null;
      voided_at: Date | string | null;
      void_reason: string | null;
    }>(
      `select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason from public.ambassador_reward_ledger where recipient_user_id = $1::uuid order by created_at desc limit 50`,
      [userId],
    ),
    db.query<{
      id: string;
      recipient_user_id: string;
      amount_usdc_atoms: bigint;
      status: "requested" | "approved" | "paid" | "failed" | "cancelled";
      destination_type: "wallet" | "manual";
      destination_value: string;
      payout_chain: "polygon";
      payout_chain_id: number;
      payout_asset: "pUSD";
      payout_asset_decimals: number;
      asset_contract_address: string;
      reviewed_by: string | null;
      reviewed_at: Date | string | null;
      paid_at: Date | string | null;
      tx_hash: string | null;
      notes: string | null;
      created_at: Date | string;
    }>(
      `
        select id, recipient_user_id, amount_usdc_atoms, status, destination_type, destination_value,
               payout_chain, payout_chain_id, payout_asset, payout_asset_decimals, asset_contract_address,
               reviewed_by, reviewed_at, paid_at, tx_hash, notes, created_at
        from public.ambassador_reward_payouts
        where recipient_user_id = $1::uuid
        order by created_at desc
        limit 20
      `,
      [userId],
    ),
  ]);

  const amountFor = (status: "pending" | "payable" | "approved" | "paid" | "void") =>
    rewardRows.find((row) => row.status === status)?.amount ?? 0n;

  return {
    ambassadorCode,
    attribution: attributionRows[0]
      ? {
          id: attributionRows[0].id,
          referredUserId: attributionRows[0].referred_user_id,
          referrerUserId: attributionRows[0].referrer_user_id,
          ambassadorCode: attributionRows[0].ambassador_code,
          attributedAt: toIso(attributionRows[0].attributed_at),
          qualificationStatus: attributionRows[0].qualification_status,
          rejectionReason: attributionRows[0].rejection_reason,
        }
      : null,
    directReferrals: directRows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      attributedAt: toIso(row.attributed_at),
      qualificationStatus: row.qualification_status,
      tradingVolumeUsdcAtoms: row.trading_volume_usdc_atoms,
    })),
    rewards: {
      pendingRewards: amountFor("pending"),
      payableRewards: amountFor("payable"),
      approvedRewards: amountFor("approved"),
      paidRewards: amountFor("paid"),
      voidRewards: amountFor("void"),
      directReferralCount: directRows.length,
      directTradingVolumeUsdcAtoms: directRows.reduce((sum, row) => sum + row.trading_volume_usdc_atoms, 0n),
    },
    rewardLedger: ledgerRows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      sourceTradeAttributionId: row.source_trade_attribution_id,
      rewardType: row.reward_type,
      amountUsdcAtoms: row.amount_usdc_atoms,
      status: row.status,
      createdAt: toIso(row.created_at),
      payableAt: toIso(row.payable_at),
      approvedAt: toIso(row.approved_at),
      paidAt: toIso(row.paid_at),
      voidedAt: toIso(row.voided_at),
      voidReason: row.void_reason,
    })),
    payouts: payoutRows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      amountUsdcAtoms: row.amount_usdc_atoms,
      status: row.status,
      destinationType: row.destination_type,
      destinationValue: row.destination_value,
      payoutChain: row.payout_chain,
      payoutChainId: row.payout_chain_id,
      payoutAsset: row.payout_asset,
      payoutAssetDecimals: row.payout_asset_decimals,
      assetContractAddress: row.asset_contract_address,
      reviewedBy: row.reviewed_by,
      reviewedAt: toIso(row.reviewed_at),
      paidAt: toIso(row.paid_at),
      txHash: row.tx_hash,
      notes: row.notes,
      createdAt: toIso(row.created_at),
    })),
  };
};

export const captureAmbassadorReferralDb = async (userId: string, code: string) => {
  const db = getDb();
  await db.transaction(async (transaction) => {
    const [existing] = await transaction.query<{ id: string }>(
      `select id from public.referral_attributions where referred_user_id = $1::uuid limit 1`,
      [userId],
    );
    if (existing) return;

    const codeRecord = await readCodeByCode(transaction, code);
    if (!codeRecord) {
      await insertRiskFlag(transaction, { userId, severity: "low", reasonCode: "invalid_referral_code", details: { code: code.trim().slice(0, 24) } });
      throw new Error("invalid ambassador code");
    }
    if (codeRecord.status !== "active") {
      await insertRiskFlag(transaction, { userId, severity: "medium", reasonCode: "disabled_referral_code", details: { codeId: codeRecord.id } });
      throw new Error("ambassador code is disabled");
    }
    if (codeRecord.owner_user_id === userId) {
      await insertRiskFlag(transaction, { userId, severity: "high", reasonCode: "self_referral_attempt", details: { codeId: codeRecord.id } });
      throw new Error("self-referrals are not allowed");
    }

    await transaction.query(
      `insert into public.referral_attributions (referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason) values ($1::uuid, $2::uuid, $3, now(), 'pending', null)`,
      [userId, codeRecord.owner_user_id, codeRecord.code],
    );
  });

  return readAmbassadorDashboardDb(userId);
};

export const requestAmbassadorPayoutDb = async (userId: string, input: { destinationType: "wallet" | "manual"; destinationValue: string }) => {
  const db = getDb();
  const dashboard = await readAmbassadorDashboardDb(userId);
  if (dashboard.rewards.payableRewards < parseMinPayout()) {
    throw new Error("payable rewards are below the minimum payout threshold");
  }
  const [openPayout] = await db.query<{ id: string }>(
    `select id from public.ambassador_reward_payouts where recipient_user_id = $1::uuid and status in ('requested', 'approved') limit 1`,
    [userId],
  );
  if (openPayout) throw new Error("recipient already has an open reward payout request");
  if (input.destinationType === "manual") throw new Error("manual payout destination is admin-only");
  const config = getRewardConfig();
  const destinationValue = normalizePayoutWalletAddress(input.destinationValue);
  const [row] = await db.query<{ id: string }>(
    `
      insert into public.ambassador_reward_payouts (
        recipient_user_id, amount_usdc_atoms, status, destination_type, destination_value,
        payout_chain, payout_chain_id, payout_asset, payout_asset_decimals, asset_contract_address, created_at
      ) values ($1::uuid, $2, 'requested', 'wallet', $3, $4, $5, $6, $7, $8, now())
      returning id
    `,
    [
      userId,
      dashboard.rewards.payableRewards,
      destinationValue,
      config.payoutChain,
      config.payoutChainId,
      config.payoutAsset,
      config.payoutAssetDecimals,
      config.polygonPusdAddress,
    ],
  );
  return { id: row?.id ?? "" };
};

export const readAdminAmbassadorOverviewDb = async () => {
  const db = getDb();
  const [codes, attributions, trades, rewardLedger, payouts, riskFlags] = await Promise.all([
    db.query(`select id, code, owner_user_id, status, created_at, disabled_at from public.ambassador_codes order by created_at desc limit 100`),
    db.query(`select id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason from public.referral_attributions order by attributed_at desc limit 100`),
    db.query(`select id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at from public.builder_trade_attributions order by observed_at desc limit 100`),
    db.query(`select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason from public.ambassador_reward_ledger order by created_at desc limit 100`),
    db.query(`
      select id, recipient_user_id, amount_usdc_atoms, status, destination_type, destination_value,
             payout_chain, payout_chain_id, payout_asset, payout_asset_decimals, asset_contract_address,
             reviewed_by, reviewed_at, paid_at, tx_hash, notes, created_at
      from public.ambassador_reward_payouts
      order by created_at desc
      limit 100
    `),
    db.query(`
      select id, user_id, referral_attribution_id, trade_attribution_id, payout_id,
             severity, reason_code, details, status, created_at, reviewed_by, reviewed_at, review_notes
        from public.ambassador_risk_flags
       order by created_at desc
       limit 100
    `).catch(() => []),
  ]);

  return {
    codes: codes.map((row) => mapCode(row as Parameters<typeof mapCode>[0])),
    attributions: attributions.map((row) => ({
      id: row.id,
      referredUserId: row.referred_user_id,
      referrerUserId: row.referrer_user_id,
      ambassadorCode: row.ambassador_code,
      attributedAt: toIso(row.attributed_at),
      qualificationStatus: row.qualification_status,
      rejectionReason: row.rejection_reason,
    })),
    tradeAttributions: trades.map((row) => ({
      id: row.id,
      userId: row.user_id,
      directReferrerUserId: row.direct_referrer_user_id,
      polymarketOrderId: row.polymarket_order_id,
      polymarketTradeId: row.polymarket_trade_id,
      conditionId: row.condition_id,
      marketSlug: row.market_slug,
      notionalUsdcAtoms: row.notional_usdc_atoms,
      builderFeeUsdcAtoms: row.builder_fee_usdc_atoms,
      status: row.status,
      rawJson: row.raw_json,
      observedAt: toIso(row.observed_at),
      confirmedAt: toIso(row.confirmed_at),
    })),
    rewardLedger: rewardLedger.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      sourceTradeAttributionId: row.source_trade_attribution_id,
      rewardType: row.reward_type,
      amountUsdcAtoms: row.amount_usdc_atoms,
      status: row.status,
      createdAt: toIso(row.created_at),
      payableAt: toIso(row.payable_at),
      approvedAt: toIso(row.approved_at),
      paidAt: toIso(row.paid_at),
      voidedAt: toIso(row.voided_at),
      voidReason: row.void_reason,
    })),
    payouts: payouts.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      amountUsdcAtoms: row.amount_usdc_atoms,
      status: row.status,
      destinationType: row.destination_type,
      destinationValue: row.destination_value,
      payoutChain: row.payout_chain,
      payoutChainId: row.payout_chain_id,
      payoutAsset: row.payout_asset,
      payoutAssetDecimals: row.payout_asset_decimals,
      assetContractAddress: row.asset_contract_address,
      reviewedBy: row.reviewed_by,
      reviewedAt: toIso(row.reviewed_at),
      paidAt: toIso(row.paid_at),
      txHash: row.tx_hash,
      notes: row.notes,
      createdAt: toIso(row.created_at),
    })),
    riskFlags: riskFlags.map((row) => ({
      id: row.id,
      userId: row.user_id,
      referralAttributionId: row.referral_attribution_id,
      tradeAttributionId: row.trade_attribution_id,
      payoutId: row.payout_id,
      severity: row.severity,
      reasonCode: row.reason_code,
      details: row.details,
      status: row.status,
      createdAt: toIso(row.created_at),
      reviewedBy: row.reviewed_by,
      reviewedAt: toIso(row.reviewed_at),
      reviewNotes: row.review_notes,
    })),
    suspiciousAttributions: [],
  };
};

export const createAdminAmbassadorCodeDb = async (input: { ownerUserId: string; code?: string | null }) => {
  const db = getDb();
  const normalizedCode = input.code?.trim().toUpperCase() || crypto.randomBytes(4).toString("hex").toUpperCase();
  const [row] = await db.query<{
    id: string;
    code: string;
    owner_user_id: string;
    status: "active" | "disabled";
    created_at: Date | string;
    disabled_at: Date | string | null;
  }>(
    `insert into public.ambassador_codes (code, owner_user_id, status, created_at, disabled_at)
     values ($1, $2::uuid, 'active', now(), null)
     returning id, code, owner_user_id, status, created_at, disabled_at`,
    [normalizedCode, input.ownerUserId],
  );
  if (!row) throw new Error("failed to create ambassador code");
  return mapCode(row);
};

export const disableAdminAmbassadorCodeDb = async (codeId: string) => {
  const db = getDb();
  const [row] = await db.query<{
    id: string;
    code: string;
    owner_user_id: string;
    status: "active" | "disabled";
    created_at: Date | string;
    disabled_at: Date | string | null;
  }>(
    `update public.ambassador_codes
       set status = 'disabled',
           disabled_at = coalesce(disabled_at, now())
     where id = $1::uuid
     returning id, code, owner_user_id, status, created_at, disabled_at`,
    [codeId],
  );
  if (!row) throw new Error("ambassador code not found");
  return mapCode(row);
};

export const overrideAdminReferralAttributionDb = async (input: {
  referredUserId: string;
  ambassadorCode: string;
  reason: string;
}) => {
  const db = getDb();
  return db.transaction(async (transaction: DatabaseTransaction) => {
    if (!input.reason.trim()) throw new Error("admin override reason is required");
    const codeRecord = await readCodeByCode(transaction, input.ambassadorCode);
    if (!codeRecord) throw new Error("invalid ambassador code");
    if (codeRecord.status !== "active") throw new Error("ambassador code is disabled");
    if (codeRecord.owner_user_id === input.referredUserId) throw new Error("self-referrals are not allowed");

    const [row] = await transaction.query<{
      id: string;
      referred_user_id: string;
      referrer_user_id: string;
      ambassador_code: string;
      attributed_at: Date | string;
      qualification_status: "pending" | "qualified" | "rejected";
      rejection_reason: string | null;
    }>(
      `insert into public.referral_attributions (referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason)
       values ($1::uuid, $2::uuid, $3, now(), 'pending', null)
       on conflict (referred_user_id)
       do update set referrer_user_id = excluded.referrer_user_id,
                     ambassador_code = excluded.ambassador_code,
                     qualification_status = 'pending',
                     rejection_reason = null
       returning id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason`,
      [input.referredUserId, codeRecord.owner_user_id, codeRecord.code],
    );
    if (!row) throw new Error("failed to override referral attribution");
    return row;
  });
};

const readTradeAttribution = async (executor: DatabaseExecutor, tradeAttributionId: string) => {
  const [row] = await executor.query<{
    id: string;
    user_id: string;
    direct_referrer_user_id: string | null;
    builder_fee_usdc_atoms: bigint;
    status: TradeStatus;
  }>(
    `select id, user_id, direct_referrer_user_id, builder_fee_usdc_atoms, status
       from public.builder_trade_attributions
      where id = $1::uuid
      limit 1`,
    [tradeAttributionId],
  );
  return row ?? null;
};

const createRewardLedgerEntriesForTrade = async (transaction: DatabaseTransaction, tradeAttributionId: string) => {
  const config = getRewardConfig();
  if (!config.enabled || !config.autoCalculationEnabled) return [];

  const trade = await readTradeAttribution(transaction, tradeAttributionId);
  if (!trade) throw new Error("builder trade attribution not found");
  if (trade.builder_fee_usdc_atoms <= 0n) throw new Error("builder fee must be positive");

  const existing = await transaction.query<{ id: string }>(
    `select id from public.ambassador_reward_ledger where source_trade_attribution_id = $1::uuid limit 1`,
    [tradeAttributionId],
  );
  if (existing.length > 0) return existing;

  const referrerAmount = trade.direct_referrer_user_id
    ? calculateBps(trade.builder_fee_usdc_atoms, config.directReferrerShareBps)
    : 0n;
  const cashbackAmount = calculateBps(trade.builder_fee_usdc_atoms, config.traderCashbackShareBps);
  const platformAmount = trade.builder_fee_usdc_atoms - referrerAmount - cashbackAmount;
  const drafts = [
    { recipientUserId: null, rewardType: "platform_revenue", amount: platformAmount },
    { recipientUserId: trade.user_id, rewardType: "trader_cashback", amount: cashbackAmount },
    ...(trade.direct_referrer_user_id
      ? [{ recipientUserId: trade.direct_referrer_user_id, rewardType: "direct_referrer_commission", amount: referrerAmount }]
      : []),
  ];

  for (const draft of drafts) {
    await transaction.query(
      `insert into public.ambassador_reward_ledger (recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at)
       values (nullif($1::uuid, $2::uuid), $3::uuid, $4, $5, 'pending', now())
       on conflict do nothing`,
      [draft.recipientUserId ?? platformRecipientUuid, platformRecipientUuid, tradeAttributionId, draft.rewardType, draft.amount],
    );
  }

  return transaction.query<{ id: string }>(
    `select id from public.ambassador_reward_ledger where source_trade_attribution_id = $1::uuid`,
    [tradeAttributionId],
  );
};

const maybeCreateAutoPayoutRequest = async (transaction: DatabaseTransaction, recipientUserId: string) => {
  const config = getRewardConfig();
  if (!config.enabled || !config.autoPayoutRequestEnabled) return null;

  const [[summary], [wallet], [openPayout]] = await Promise.all([
    transaction.query<{ amount: bigint }>(
      `select coalesce(sum(amount_usdc_atoms), 0::bigint) as amount from public.ambassador_reward_ledger where recipient_user_id = $1::uuid and status = 'payable'`,
      [recipientUserId],
    ),
    transaction.query<{ wallet_address: string; asset_preference: string }>(
      `select wallet_address, asset_preference from public.ambassador_payout_wallets where user_id = $1::uuid and chain = 'polygon' limit 1`,
      [recipientUserId],
    ),
    transaction.query<{ id: string }>(
      `select id from public.ambassador_reward_payouts where recipient_user_id = $1::uuid and status in ('requested', 'approved') limit 1`,
      [recipientUserId],
    ),
  ]);

  const payableBalance = summary?.amount ?? 0n;
  if (payableBalance < parseMinPayout() || payableBalance <= 0n || openPayout) return null;
  if (!wallet || wallet.asset_preference !== "pUSD") return null;
  let destinationValue: string;
  try {
    destinationValue = normalizePayoutWalletAddress(wallet.wallet_address);
  } catch {
    return null;
  }

  const [row] = await transaction.query<{ id: string }>(
    `
      insert into public.ambassador_reward_payouts (
        recipient_user_id, amount_usdc_atoms, status, destination_type, destination_value,
        payout_chain, payout_chain_id, payout_asset, payout_asset_decimals, asset_contract_address, created_at
      ) values ($1::uuid, $2, 'requested', 'wallet', $3, $4, $5, $6, $7, $8, now())
      on conflict do nothing
      returning id
    `,
    [
      recipientUserId,
      payableBalance,
      destinationValue,
      config.payoutChain,
      config.payoutChainId,
      config.payoutAsset,
      config.payoutAssetDecimals,
      config.polygonPusdAddress,
    ],
  );
  return row ?? null;
};

export const markRewardsPayableDb = async (tradeAttributionId: string) => {
  const db = getDb();
  return db.transaction(async (transaction) => {
    const trade = await readTradeAttribution(transaction, tradeAttributionId);
    if (!trade || trade.status !== "confirmed") {
      throw new Error("builder trade attribution must be confirmed before rewards become payable");
    }
    await createRewardLedgerEntriesForTrade(transaction, tradeAttributionId);
    await transaction.query(
      `update public.ambassador_reward_ledger
          set status = 'payable',
              payable_at = coalesce(payable_at, now())
        where source_trade_attribution_id = $1::uuid
          and status = 'pending'`,
      [tradeAttributionId],
    );
    const recipients = await transaction.query<{ recipient_user_id: string }>(
      `select distinct recipient_user_id from public.ambassador_reward_ledger where source_trade_attribution_id = $1::uuid and recipient_user_id is not null`,
      [tradeAttributionId],
    );
    for (const recipient of recipients) {
      await maybeCreateAutoPayoutRequest(transaction, recipient.recipient_user_id);
    }
    return { ok: true };
  });
};

export const recordAdminMockBuilderTradeAttributionDb = async (input: {
  userId: string;
  polymarketOrderId?: string | null;
  polymarketTradeId?: string | null;
  conditionId?: string | null;
  marketSlug?: string | null;
  notionalUsdcAtoms: bigint;
  builderFeeUsdcAtoms: bigint;
  status: TradeStatus;
}) => {
  if (input.notionalUsdcAtoms <= 0n) throw new Error("notional must be positive");
  if (input.builderFeeUsdcAtoms <= 0n) throw new Error("builder fee must be positive");

  const db = getDb();
  return db.transaction(async (transaction) => {
    const [existing] = await transaction.query<{ id: string }>(
      `select id from public.builder_trade_attributions
        where ($1::text is not null and polymarket_order_id = $1)
           or ($2::text is not null and polymarket_trade_id = $2)
        limit 1`,
      [input.polymarketOrderId ?? null, input.polymarketTradeId ?? null],
    );
    if (existing) return { tradeAttributionId: existing.id, idempotent: true };

    const [attribution] = await transaction.query<{ referrer_user_id: string; qualification_status: string }>(
      `select referrer_user_id, qualification_status from public.referral_attributions where referred_user_id = $1::uuid limit 1`,
      [input.userId],
    );
    const directReferrerUserId = attribution?.qualification_status === "rejected" ? null : attribution?.referrer_user_id ?? null;
    const [row] = await transaction.query<{ id: string }>(
      `insert into public.builder_trade_attributions (
         user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug,
         notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at
       ) values (
         $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now(),
         case when $9 = 'confirmed' then now() else null end
       )
       returning id`,
      [
        input.userId,
        directReferrerUserId,
        input.polymarketOrderId ?? null,
        input.polymarketTradeId ?? null,
        input.conditionId ?? null,
        input.marketSlug ?? null,
        input.notionalUsdcAtoms,
        input.builderFeeUsdcAtoms,
        input.status,
        JSON.stringify({ source: "admin_mock" }),
      ],
    );
    if (!row) throw new Error("failed to record builder trade attribution");
    if (input.builderFeeUsdcAtoms >= 100_000_000n && !input.polymarketOrderId && !input.polymarketTradeId) {
      await insertRiskFlag(transaction, {
        userId: input.userId,
        tradeAttributionId: row.id,
        severity: "high",
        reasonCode: "high_builder_fee_missing_external_id",
        details: { builderFeeUsdcAtoms: input.builderFeeUsdcAtoms.toString() },
      });
    }
    if (input.status === "confirmed") {
      await createRewardLedgerEntriesForTrade(transaction, row.id);
      await transaction.query(
        `update public.ambassador_reward_ledger
            set status = 'payable',
                payable_at = coalesce(payable_at, now())
          where source_trade_attribution_id = $1::uuid
            and status = 'pending'`,
        [row.id],
      );
      const recipients = await transaction.query<{ recipient_user_id: string }>(
        `select distinct recipient_user_id from public.ambassador_reward_ledger where source_trade_attribution_id = $1::uuid and recipient_user_id is not null`,
        [row.id],
      );
      for (const recipient of recipients) {
        await maybeCreateAutoPayoutRequest(transaction, recipient.recipient_user_id);
      }
    }
    return { tradeAttributionId: row.id, idempotent: false };
  });
};

export const voidRewardsForTradeAttributionDb = async (tradeAttributionId: string, reason: string) => {
  const db = getDb();
  await db.transaction(async (transaction) => {
    await transaction.query(`update public.builder_trade_attributions set status = 'void' where id = $1::uuid`, [tradeAttributionId]);
    await transaction.query(
      `update public.ambassador_reward_ledger
          set status = 'void',
              voided_at = coalesce(voided_at, now()),
              void_reason = $2
        where source_trade_attribution_id = $1::uuid
          and status <> 'paid'`,
      [tradeAttributionId, reason],
    );
  });
  return { ok: true };
};

const updatePayoutStatusDb = async (input: {
  payoutId: string;
  reviewedBy: string;
  status: PayoutStatus;
  txHash?: string | null;
  notes?: string | null;
}) => {
  const db = getDb();
  const [row] = await db.query<{ id: string; recipient_user_id: string; amount_usdc_atoms: bigint; status: PayoutStatus; destination_type: "wallet" | "manual"; destination_value: string }>(
    `select id, recipient_user_id, amount_usdc_atoms, status, destination_type, destination_value from public.ambassador_reward_payouts where id = $1::uuid limit 1`,
    [input.payoutId],
  );
  if (!row) throw new Error("payout not found");
  if (["approved", "paid", "cancelled"].includes(row.status) && input.status === "approved") {
    throw new Error("payout already reviewed");
  }
  if (input.status === "approved" && row.destination_type === "wallet") {
    normalizePayoutWalletAddress(row.destination_value);
  }

  if (input.status === "approved") {
    const [[risk], [payable]] = await Promise.all([
      db.query<{ id: string }>(
        `select id from public.ambassador_risk_flags where user_id = $1::uuid and status = 'open' and severity = 'high' limit 1`,
        [row.recipient_user_id],
      ).then((rows) => [rows[0]]),
      db.query<{ amount: bigint }>(
        `select coalesce(sum(amount_usdc_atoms), 0::bigint) as amount from public.ambassador_reward_ledger where recipient_user_id = $1::uuid and status = 'payable'`,
        [row.recipient_user_id],
      ).then((rows) => [rows[0]]),
    ]);
    if (risk) throw new Error("recipient has open high-severity risk flag");
    if ((payable?.amount ?? 0n) < row.amount_usdc_atoms) throw new Error("payout amount exceeds payable rewards");
    await db.query(
      `update public.ambassador_reward_payouts
          set status = 'approved',
              reviewed_by = $2::uuid,
              reviewed_at = coalesce(reviewed_at, now()),
              notes = coalesce($3, notes)
        where id = $1::uuid
          and status = 'requested'`,
      [input.payoutId, input.reviewedBy, input.notes ?? null],
    );
    await db.query(
      `update public.ambassador_reward_ledger
          set status = 'approved',
              approved_at = coalesce(approved_at, now())
        where recipient_user_id = $1::uuid
          and status = 'payable'`,
      [row.recipient_user_id],
    );
    return { ok: true };
  }

  if (input.status === "paid") {
    const [existing] = await db.query<{ status: string; destination_type: "wallet" | "manual" }>(
      `select status, destination_type from public.ambassador_reward_payouts where id = $1::uuid limit 1`,
      [input.payoutId],
    );
    if (existing?.status !== "approved") throw new Error("payout requires admin approval before it can be marked paid");
    const txHash = existing.destination_type === "wallet" ? assertValidPayoutTxHash(input.txHash) : input.txHash?.trim() || null;
    await db.query(
      `update public.ambassador_reward_payouts
          set status = 'paid',
              reviewed_by = coalesce(reviewed_by, $2::uuid),
              reviewed_at = coalesce(reviewed_at, now()),
              paid_at = now(),
              tx_hash = $3,
              notes = coalesce($4, notes)
        where id = $1::uuid`,
      [input.payoutId, input.reviewedBy, txHash, input.notes ?? null],
    );
    await db.query(
      `update public.ambassador_reward_ledger
          set status = 'paid',
              paid_at = coalesce(paid_at, now())
        where recipient_user_id = $1::uuid
          and status in ('payable', 'approved')`,
      [row.recipient_user_id],
    );
    return { ok: true };
  }

  if (input.status === "failed" || input.status === "cancelled") {
    await db.query(
      `update public.ambassador_reward_payouts
          set status = $3,
              reviewed_by = coalesce(reviewed_by, $2::uuid),
              reviewed_at = coalesce(reviewed_at, now()),
              notes = $4
        where id = $1::uuid
          and status in ('requested', 'approved')`,
      [input.payoutId, input.reviewedBy, input.status, input.notes ?? ""],
    );
    return { ok: true };
  }

  throw new Error("unsupported payout status");
};

export const approveRewardPayoutDb = (input: { payoutId: string; reviewedBy: string; notes?: string | null }) =>
  updatePayoutStatusDb({ ...input, status: "approved" });

export const markRewardPayoutPaidDb = (input: { payoutId: string; reviewedBy: string; txHash?: string | null; notes?: string | null }) =>
  updatePayoutStatusDb({ ...input, status: "paid" });

export const failRewardPayoutDb = (input: { payoutId: string; reviewedBy: string; notes: string }) =>
  updatePayoutStatusDb({ ...input, status: "failed" });

export const cancelRewardPayoutDb = (input: { payoutId: string; reviewedBy: string; notes: string }) =>
  updatePayoutStatusDb({ ...input, status: "cancelled" });
