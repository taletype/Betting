import crypto from "node:crypto";

import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";
import { getPolymarketBuilderCode } from "@bet/integrations";
import { isAddress } from "ethers";

export type AmbassadorCodeStatus = "active" | "disabled";
export type ReferralQualificationStatus = "pending" | "qualified" | "rejected";
export type BuilderTradeAttributionStatus = "pending" | "confirmed" | "void";
export type AmbassadorRewardStatus = "pending" | "payable" | "approved" | "paid" | "void";
export type AmbassadorPayoutStatus = "requested" | "approved" | "paid" | "failed" | "cancelled";
export type AmbassadorPayoutDestinationType = "wallet" | "manual";
export type AmbassadorRiskSeverity = "low" | "medium" | "high";
export type AmbassadorRiskStatus = "open" | "reviewed" | "dismissed";

export const ambassadorPayoutRiskReviewRequiredCode = "AMBASSADOR_PAYOUT_RISK_REVIEW_REQUIRED";
export const ambassadorPayoutRiskReviewRequiredMessage = "high-severity risk review is required before payout approval";

export class AmbassadorPayoutRiskReviewRequiredError extends Error {
  readonly code = ambassadorPayoutRiskReviewRequiredCode;

  constructor() {
    super(ambassadorPayoutRiskReviewRequiredMessage);
    this.name = "AmbassadorPayoutRiskReviewRequiredError";
  }
}

export const ambassadorRewardTypes = [
  "platform_revenue",
  "direct_referrer_commission",
  "trader_cashback",
] as const;

export type AmbassadorRewardType = (typeof ambassadorRewardTypes)[number];

export interface AmbassadorCodeRecord {
  id: string;
  code: string;
  ownerUserId: string;
  status: AmbassadorCodeStatus;
  createdAt: string;
  disabledAt: string | null;
}

export interface ReferralAttributionRecord {
  id: string;
  referredUserId: string;
  referrerUserId: string;
  ambassadorCode: string;
  attributedAt: string;
  qualificationStatus: ReferralQualificationStatus;
  rejectionReason: string | null;
}

export interface AmbassadorDirectReferralRecord {
  userId: string;
  username: string | null;
  displayName: string | null;
  attributedAt: string;
  qualificationStatus: ReferralQualificationStatus;
  tradingVolumeUsdcAtoms: bigint;
}

export interface BuilderTradeAttributionRecord {
  id: string;
  userId: string;
  directReferrerUserId: string | null;
  polymarketOrderId: string | null;
  polymarketTradeId: string | null;
  conditionId: string | null;
  marketSlug: string | null;
  notionalUsdcAtoms: bigint;
  builderFeeUsdcAtoms: bigint;
  status: BuilderTradeAttributionStatus;
  rawJson: Record<string, unknown>;
  observedAt: string;
  confirmedAt: string | null;
}

export interface AmbassadorRewardLedgerRecord {
  id: string;
  recipientUserId: string | null;
  sourceTradeAttributionId: string;
  rewardType: AmbassadorRewardType;
  amountUsdcAtoms: bigint;
  status: AmbassadorRewardStatus;
  createdAt: string;
  payableAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface AmbassadorRewardPayoutRecord {
  id: string;
  recipientUserId: string;
  amountUsdcAtoms: bigint;
  status: AmbassadorPayoutStatus;
  destinationType: AmbassadorPayoutDestinationType;
  destinationValue: string;
  payoutChain: "polygon";
  payoutChainId: number;
  payoutAsset: "pUSD";
  payoutAssetDecimals: number;
  assetContractAddress: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  txHash: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AmbassadorRiskFlagRecord {
  id: string;
  userId: string | null;
  referralAttributionId: string | null;
  tradeAttributionId: string | null;
  payoutId: string | null;
  severity: AmbassadorRiskSeverity;
  reasonCode: string;
  details: Record<string, unknown>;
  status: AmbassadorRiskStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface AdminAuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AmbassadorRewardSummary {
  pendingRewards: bigint;
  payableRewards: bigint;
  approvedRewards: bigint;
  paidRewards: bigint;
  voidRewards: bigint;
  directReferralCount: number;
  directTradingVolumeUsdcAtoms: bigint;
}

export interface AmbassadorDashboard {
  ambassadorCode: AmbassadorCodeRecord & { inviteUrl: string };
  attribution: ReferralAttributionRecord | null;
  directReferrals: AmbassadorDirectReferralRecord[];
  rewards: AmbassadorRewardSummary;
  rewardLedger: AmbassadorRewardLedgerRecord[];
  payouts: AmbassadorRewardPayoutRecord[];
}

export interface AdminAmbassadorOverview {
  codes: AmbassadorCodeRecord[];
  attributions: ReferralAttributionRecord[];
  tradeAttributions: BuilderTradeAttributionRecord[];
  rewardLedger: AmbassadorRewardLedgerRecord[];
  payouts: AmbassadorRewardPayoutRecord[];
  riskFlags: AmbassadorRiskFlagRecord[];
  adminAuditLog: AdminAuditLogRecord[];
  suspiciousAttributions: ReferralAttributionRecord[];
}

export interface AmbassadorRewardsConfig {
  enabled: boolean;
  platformShareBps: number;
  directReferrerShareBps: number;
  traderCashbackShareBps: number;
  minPayoutUsdcAtoms: bigint;
  autoCalculationEnabled: boolean;
  autoPayoutRequestEnabled: boolean;
  autoPayoutEnabled: boolean;
  payoutChain: "polygon";
  payoutChainId: number;
  payoutAsset: "pUSD";
  payoutAssetDecimals: number;
  polygonExplorerUrl: string;
  polygonPayoutTreasuryAddress: string;
  polygonPusdAddress: string;
}

export interface RewardLedgerDraft {
  recipientUserId: string | null;
  rewardType: AmbassadorRewardType;
  amountUsdcAtoms: bigint;
}

export interface ReferralApplyContext {
  idempotencyKey?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ReferralClickRecord {
  id: string;
  code: string;
  status: "seen" | "captured" | "rejected" | "applied";
  rejectReason: string | null;
  anonymousSessionId: string | null;
}

export interface BuilderRouteEventRecord {
  id: string;
  idempotencyKey: string;
  eventType: string;
  status: "ingested" | "eligible" | "ineligible" | "rejected" | "void";
  ineligibleReason: string | null;
}

interface AmbassadorCodeRow {
  id: string;
  code: string;
  owner_user_id: string;
  status: AmbassadorCodeStatus;
  created_at: Date | string;
  disabled_at: Date | string | null;
}

interface ReferralAttributionRow {
  id: string;
  referred_user_id: string;
  referrer_user_id: string;
  ambassador_code: string;
  attributed_at: Date | string;
  qualification_status: ReferralQualificationStatus;
  rejection_reason: string | null;
}

interface DirectReferralRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  attributed_at: Date | string;
  qualification_status: ReferralQualificationStatus;
  trading_volume_usdc_atoms: bigint;
}

interface BuilderTradeAttributionRow {
  id: string;
  user_id: string;
  direct_referrer_user_id: string | null;
  polymarket_order_id: string | null;
  polymarket_trade_id: string | null;
  condition_id: string | null;
  market_slug: string | null;
  notional_usdc_atoms: bigint;
  builder_fee_usdc_atoms: bigint;
  status: BuilderTradeAttributionStatus;
  raw_json: Record<string, unknown> | string;
  observed_at: Date | string;
  confirmed_at: Date | string | null;
}

interface RewardLedgerRow {
  id: string;
  recipient_user_id: string | null;
  source_trade_attribution_id: string;
  reward_type: AmbassadorRewardType;
  amount_usdc_atoms: bigint;
  status: AmbassadorRewardStatus;
  created_at: Date | string;
  payable_at: Date | string | null;
  approved_at: Date | string | null;
  paid_at: Date | string | null;
  voided_at: Date | string | null;
  void_reason: string | null;
}

interface PayoutRow {
  id: string;
  recipient_user_id: string;
  amount_usdc_atoms: bigint;
  status: AmbassadorPayoutStatus;
  destination_type: AmbassadorPayoutDestinationType;
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
}

interface PayoutWalletRow {
  user_id: string;
  chain: "polygon";
  wallet_address: string;
  asset_preference: "pUSD";
}

interface RiskFlagRow {
  id: string;
  user_id: string | null;
  referral_attribution_id: string | null;
  trade_attribution_id: string | null;
  payout_id: string | null;
  severity: AmbassadorRiskSeverity;
  reason_code: string;
  details: Record<string, unknown> | string;
  status: AmbassadorRiskStatus;
  created_at: Date | string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  review_notes: string | null;
}

interface AdminAuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | string;
  created_at: Date | string;
}

interface ReferralClickRow {
  id: string;
  raw_code: string;
  status: "seen" | "captured" | "rejected" | "applied";
  reject_reason: string | null;
  anonymous_session_id: string | null;
}

interface BuilderRouteEventRow {
  id: string;
  idempotency_key: string;
  event_type: string;
  status: "ingested" | "eligible" | "ineligible" | "rejected" | "void";
  ineligible_reason: string | null;
}

const zeroUuid = "00000000-0000-0000-0000-000000000000";
const defaultPolygonPusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const referralCodePattern = /^[A-Z0-9_-]{3,64}$/;

export const normalizeReferralCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase();
  return normalized && referralCodePattern.test(normalized) ? normalized : null;
};

const hashNullable = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex");
};

const toIso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapCode = (row: AmbassadorCodeRow): AmbassadorCodeRecord => ({
  id: row.id,
  code: row.code,
  ownerUserId: row.owner_user_id,
  status: row.status,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  disabledAt: toIso(row.disabled_at),
});

const mapAttribution = (row: ReferralAttributionRow): ReferralAttributionRecord => ({
  id: row.id,
  referredUserId: row.referred_user_id,
  referrerUserId: row.referrer_user_id,
  ambassadorCode: row.ambassador_code,
  attributedAt: toIso(row.attributed_at) ?? new Date().toISOString(),
  qualificationStatus: row.qualification_status,
  rejectionReason: row.rejection_reason,
});

const mapDirectReferral = (row: DirectReferralRow): AmbassadorDirectReferralRecord => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  attributedAt: toIso(row.attributed_at) ?? new Date().toISOString(),
  qualificationStatus: row.qualification_status,
  tradingVolumeUsdcAtoms: row.trading_volume_usdc_atoms,
});

const mapTradeAttribution = (row: BuilderTradeAttributionRow): BuilderTradeAttributionRecord => ({
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
  rawJson: typeof row.raw_json === "string" ? JSON.parse(row.raw_json) as Record<string, unknown> : row.raw_json,
  observedAt: toIso(row.observed_at) ?? new Date().toISOString(),
  confirmedAt: toIso(row.confirmed_at),
});

const mapRewardLedger = (row: RewardLedgerRow): AmbassadorRewardLedgerRecord => ({
  id: row.id,
  recipientUserId: row.recipient_user_id,
  sourceTradeAttributionId: row.source_trade_attribution_id,
  rewardType: row.reward_type,
  amountUsdcAtoms: row.amount_usdc_atoms,
  status: row.status,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  payableAt: toIso(row.payable_at),
  approvedAt: toIso(row.approved_at),
  paidAt: toIso(row.paid_at),
  voidedAt: toIso(row.voided_at),
  voidReason: row.void_reason,
});

const mapPayout = (row: PayoutRow): AmbassadorRewardPayoutRecord => ({
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
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
});

const mapRiskFlag = (row: RiskFlagRow): AmbassadorRiskFlagRecord => ({
  id: row.id,
  userId: row.user_id,
  referralAttributionId: row.referral_attribution_id,
  tradeAttributionId: row.trade_attribution_id,
  payoutId: row.payout_id,
  severity: row.severity,
  reasonCode: row.reason_code,
  details: typeof row.details === "string" ? JSON.parse(row.details) as Record<string, unknown> : row.details,
  status: row.status,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  reviewedBy: row.reviewed_by,
  reviewedAt: toIso(row.reviewed_at),
  reviewNotes: row.review_notes,
});

const mapAdminAuditLog = (row: AdminAuditLogRow): AdminAuditLogRecord => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) as Record<string, unknown> : row.metadata,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
});

const mapReferralClick = (row: ReferralClickRow): ReferralClickRecord => ({
  id: row.id,
  code: row.raw_code,
  status: row.status,
  rejectReason: row.reject_reason,
  anonymousSessionId: row.anonymous_session_id,
});

const mapBuilderRouteEvent = (row: BuilderRouteEventRow): BuilderRouteEventRecord => ({
  id: row.id,
  idempotencyKey: row.idempotency_key,
  eventType: row.event_type,
  status: row.status,
  ineligibleReason: row.ineligible_reason,
});

export const insertRiskFlag = async (
  executor: DatabaseExecutor,
  input: {
    userId?: string | null;
    referralAttributionId?: string | null;
    tradeAttributionId?: string | null;
    payoutId?: string | null;
    severity: AmbassadorRiskSeverity;
    reasonCode: string;
    details?: Record<string, unknown>;
  },
): Promise<void> => {
  await executor.query(
    `
      insert into public.ambassador_risk_flags (
        user_id,
        referral_attribution_id,
        trade_attribution_id,
        payout_id,
        severity,
        reason_code,
        details,
        status,
        created_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $7::jsonb,
        'open',
        now()
      )
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

const insertReferralAuditEvent = async (
  executor: DatabaseExecutor,
  input: {
    actorUserId: string | null;
    action: "ambassador.referral_seen" | "ambassador.referral_captured" | "ambassador.referral_applied" | "ambassador.referral_rejected";
    code: string;
    reason?: string | null;
    referralAttributionId?: string | null;
    context?: ReferralApplyContext;
  },
): Promise<void> => {
  await executor.query(
    `
      insert into public.audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) values (
        $1::uuid,
        $2,
        'referral_attribution',
        $3,
        $4::jsonb,
        now()
      )
    `,
    [
      input.actorUserId,
      input.action,
      input.referralAttributionId ?? input.actorUserId ?? zeroUuid,
      JSON.stringify({
        ambassadorCode: input.code,
        reason: input.reason ?? null,
        idempotencyKey: input.context?.idempotencyKey?.trim() || null,
        sessionHash: hashNullable(input.context?.sessionId),
        ipHash: hashNullable(input.context?.ipAddress),
        userAgentHash: hashNullable(input.context?.userAgent),
      }),
    ],
  );
};

const parseBooleanEnv = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return defaultValue;
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

const parseBigIntEnv = (name: string, defaultValue: bigint): bigint => {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  return BigInt(value);
};

const parseStringEnv = (name: string, defaultValue: string): string => {
  const value = process.env[name]?.trim();
  return value || defaultValue;
};

const assertBps = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error(`${name} must be between 0 and 10000 bps`);
  }
};

export const getAmbassadorRewardsConfig = (): AmbassadorRewardsConfig => {
  const config: AmbassadorRewardsConfig = {
    enabled: parseBooleanEnv("AMBASSADOR_REWARDS_ENABLED", false),
    platformShareBps: parseIntegerEnv("AMBASSADOR_PLATFORM_SHARE_BPS", 6000),
    directReferrerShareBps: parseIntegerEnv("AMBASSADOR_DIRECT_REFERRER_SHARE_BPS", 3000),
    traderCashbackShareBps: parseIntegerEnv("AMBASSADOR_TRADER_CASHBACK_SHARE_BPS", 1000),
    minPayoutUsdcAtoms: parseBigIntEnv("AMBASSADOR_MIN_PAYOUT_USDC_ATOMS", 0n),
    autoCalculationEnabled: parseBooleanEnv("AMBASSADOR_AUTO_CALCULATION_ENABLED", true),
    autoPayoutRequestEnabled: parseBooleanEnv("AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED", false),
    autoPayoutEnabled: parseBooleanEnv("AMBASSADOR_AUTO_PAYOUT_ENABLED", false),
    payoutChain: parseStringEnv("PAYOUT_CHAIN", "polygon") as "polygon",
    payoutChainId: parseIntegerEnv("PAYOUT_CHAIN_ID", 137),
    payoutAsset: parseStringEnv("PAYOUT_ASSET", "pUSD") as "pUSD",
    payoutAssetDecimals: parseIntegerEnv("PAYOUT_ASSET_DECIMALS", 6),
    polygonExplorerUrl: parseStringEnv("POLYGON_EXPLORER_URL", "https://polygonscan.com"),
    polygonPayoutTreasuryAddress: parseStringEnv("POLYGON_PAYOUT_TREASURY_ADDRESS", "placeholder"),
    polygonPusdAddress: parseStringEnv("POLYGON_PUSD_ADDRESS", defaultPolygonPusdAddress),
  };

  validateRewardShareConfig(config);
  return config;
};

export const validateRewardShareConfig = (config: AmbassadorRewardsConfig): void => {
  assertBps("AMBASSADOR_PLATFORM_SHARE_BPS", config.platformShareBps);
  assertBps("AMBASSADOR_DIRECT_REFERRER_SHARE_BPS", config.directReferrerShareBps);
  assertBps("AMBASSADOR_TRADER_CASHBACK_SHARE_BPS", config.traderCashbackShareBps);

  const total = config.platformShareBps + config.directReferrerShareBps + config.traderCashbackShareBps;
  if (total !== 10000) {
    throw new Error("ambassador reward shares must sum to 10000 bps");
  }

  if (config.minPayoutUsdcAtoms < 0n) {
    throw new Error("AMBASSADOR_MIN_PAYOUT_USDC_ATOMS must be non-negative");
  }

  if (config.autoPayoutEnabled) {
    throw new Error("AMBASSADOR_AUTO_PAYOUT_ENABLED must remain false; automatic crypto payouts are not supported");
  }
  if (config.autoPayoutRequestEnabled) {
    throw new Error("AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED must remain false; payout requests must stay manual");
  }

  if (config.payoutChain !== "polygon") {
    throw new Error("PAYOUT_CHAIN must be polygon");
  }

  if (config.payoutChainId !== 137) {
    throw new Error("PAYOUT_CHAIN_ID must be 137 for Polygon payouts");
  }

  if (config.payoutAsset !== "pUSD") {
    throw new Error("PAYOUT_ASSET must be pUSD");
  }

  if (config.payoutAssetDecimals !== 6) {
    throw new Error("PAYOUT_ASSET_DECIMALS must be 6 for pUSD");
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.polygonExplorerUrl);
  } catch {
    throw new Error("POLYGON_EXPLORER_URL must be a valid URL");
  }

  if (config.polygonPayoutTreasuryAddress !== "placeholder" && !isAddress(config.polygonPayoutTreasuryAddress)) {
    throw new Error("POLYGON_PAYOUT_TREASURY_ADDRESS must be placeholder or a valid EVM address");
  }

  if (!isAddress(config.polygonPusdAddress)) {
    throw new Error("POLYGON_PUSD_ADDRESS must be a valid EVM address");
  }
};

export const normalizePayoutWalletAddress = (address: string): string => {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized) || !isAddress(normalized)) {
    throw new Error("Polygon payout wallet must be a valid 0x EVM address");
  }
  return normalized;
};

export const normalizeEvmWalletAddress = (address: string | null | undefined): string | null => {
  const normalized = address?.trim().toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(normalized) || !isAddress(normalized)) return null;
  return normalized;
};

export const assertValidPayoutTxHash = (txHash: string | null | undefined): string => {
  const normalized = txHash?.trim().toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("wallet payout tx hash must be a 32-byte 0x hash");
  }
  return normalized;
};

export const buildPolygonTxUrl = (txHash: string, explorerUrl = getAmbassadorRewardsConfig().polygonExplorerUrl): string =>
  `${explorerUrl.replace(/\/+$/, "")}/tx/${assertValidPayoutTxHash(txHash)}`;

export const assertAllowedRewardType = (rewardType: string): asserts rewardType is AmbassadorRewardType => {
  if (!ambassadorRewardTypes.includes(rewardType as AmbassadorRewardType)) {
    throw new Error(`unsupported ambassador reward type: ${rewardType}`);
  }
};

export const calculateBpsAmount = (amount: bigint, bps: number): bigint => (amount * BigInt(bps)) / 10000n;

export const calculateAmbassadorRewards = (input: {
  builderFeeUsdcAtoms: bigint;
  traderUserId: string;
  directReferrerUserId: string | null;
  config: AmbassadorRewardsConfig;
}): RewardLedgerDraft[] => {
  validateRewardShareConfig(input.config);
  if (input.builderFeeUsdcAtoms <= 0n) {
    throw new Error("builder fee must be positive");
  }

  const directReferrerAmount = input.directReferrerUserId
    ? calculateBpsAmount(input.builderFeeUsdcAtoms, input.config.directReferrerShareBps)
    : 0n;
  const traderCashbackAmount = calculateBpsAmount(input.builderFeeUsdcAtoms, input.config.traderCashbackShareBps);
  const platformAmount = input.builderFeeUsdcAtoms - directReferrerAmount - traderCashbackAmount;

  const drafts: RewardLedgerDraft[] = [
    {
      recipientUserId: null,
      rewardType: "platform_revenue",
      amountUsdcAtoms: platformAmount,
    },
    {
      recipientUserId: input.traderUserId,
      rewardType: "trader_cashback",
      amountUsdcAtoms: traderCashbackAmount,
    },
  ];

  if (input.directReferrerUserId && directReferrerAmount > 0n) {
    drafts.push({
      recipientUserId: input.directReferrerUserId,
      rewardType: "direct_referrer_commission",
      amountUsdcAtoms: directReferrerAmount,
    });
  }

  return drafts;
};

export const calculateRewardLedgerDrafts = calculateAmbassadorRewards;

export const generateAmbassadorCode = (): string => crypto.randomBytes(4).toString("hex").toUpperCase();

export const ensureProfileForUser = async (
  transaction: DatabaseTransaction,
  userId: string,
): Promise<void> => {
  await transaction.query(
    `
      insert into public.profiles (id, locale, created_at, updated_at)
      values ($1::uuid, 'zh-HK', now(), now())
      on conflict (id) do update
        set locale = coalesce(public.profiles.locale, 'zh-HK'),
            updated_at = public.profiles.updated_at
    `,
    [userId],
  );
};

export type ReferralAttributionDecision =
  | { action: "create"; referrerUserId: string; ambassadorCode: string }
  | { action: "existing"; attribution: ReferralAttributionRecord };

export const decideReferralAttribution = (input: {
  referredUserId: string;
  existingAttribution: ReferralAttributionRecord | null;
  codeRecord: AmbassadorCodeRecord | null;
}): ReferralAttributionDecision => {
  if (input.existingAttribution) {
    return { action: "existing", attribution: input.existingAttribution };
  }

  if (!input.codeRecord) {
    throw new Error("invalid ambassador code");
  }

  if (input.codeRecord.status !== "active") {
    throw new Error("ambassador code is disabled");
  }

  if (input.codeRecord.ownerUserId === input.referredUserId) {
    throw new Error("self-referrals are not allowed");
  }

  return {
    action: "create",
    referrerUserId: input.codeRecord.ownerUserId,
    ambassadorCode: input.codeRecord.code,
  };
};

export const ensureAmbassadorCode = async (
  transaction: DatabaseTransaction,
  userId: string,
): Promise<AmbassadorCodeRecord> => {
  await ensureProfileForUser(transaction, userId);

  const [existing] = await transaction.query<AmbassadorCodeRow>(
    `
      select id, code, owner_user_id, status, created_at, disabled_at
      from public.ambassador_codes
      where owner_user_id = $1::uuid
        and status = 'active'
      order by created_at asc
      limit 1
    `,
    [userId],
  );
  if (existing) return mapCode(existing);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [inserted] = await transaction.query<AmbassadorCodeRow>(
      `
        insert into public.ambassador_codes (code, owner_user_id, status, created_at, disabled_at)
        values ($1, $2::uuid, 'active', now(), null)
        on conflict do nothing
        returning id, code, owner_user_id, status, created_at, disabled_at
      `,
      [generateAmbassadorCode(), userId],
    );
    if (inserted) return mapCode(inserted);

    const [createdConcurrently] = await transaction.query<AmbassadorCodeRow>(
      `
        select id, code, owner_user_id, status, created_at, disabled_at
        from public.ambassador_codes
        where owner_user_id = $1::uuid
          and status = 'active'
        order by created_at asc
        limit 1
      `,
      [userId],
    );
    if (createdConcurrently) return mapCode(createdConcurrently);
  }

  throw new Error("failed to generate ambassador code");
};

export const createAmbassadorCodeForUser = async (
  transaction: DatabaseTransaction,
  input: { ownerUserId: string; code?: string | null },
): Promise<AmbassadorCodeRecord> => {
  const normalizedCode = input.code ? normalizeReferralCode(input.code) : generateAmbassadorCode();
  if (!normalizedCode) throw new Error("ambassador code is malformed");
  const [row] = await transaction.query<AmbassadorCodeRow>(
    `
      insert into public.ambassador_codes (code, owner_user_id, status, created_at, disabled_at)
      values ($1, $2::uuid, 'active', now(), null)
      returning id, code, owner_user_id, status, created_at, disabled_at
    `,
    [normalizedCode, input.ownerUserId],
  );
  if (!row) throw new Error("failed to create ambassador code");
  return mapCode(row);
};

export const disableAmbassadorCode = async (
  transaction: DatabaseTransaction,
  codeId: string,
): Promise<AmbassadorCodeRecord> => {
  const [row] = await transaction.query<AmbassadorCodeRow>(
    `
      update public.ambassador_codes
      set status = 'disabled',
          disabled_at = coalesce(disabled_at, now())
      where id = $1::uuid
      returning id, code, owner_user_id, status, created_at, disabled_at
    `,
    [codeId],
  );
  if (!row) throw new Error("ambassador code not found");
  return mapCode(row);
};

export const getAmbassadorCodeByCode = async (
  executor: DatabaseExecutor,
  code: string,
): Promise<AmbassadorCodeRecord | null> => {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return null;

  const [row] = await executor.query<AmbassadorCodeRow>(
    `
      select id, code, owner_user_id, status, created_at, disabled_at
      from public.ambassador_codes
      where upper(code) = upper($1)
      limit 1
    `,
    [normalizedCode],
  );
  return row ? mapCode(row) : null;
};

export const recordReferralClick = async (
  transaction: DatabaseTransaction,
  input: {
    rawCode: string;
    landingPath?: string | null;
    queryRef?: string | null;
    anonymousSessionId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<ReferralClickRecord> => {
  const rawCode = input.rawCode.trim().slice(0, 128);
  const normalizedCode = normalizeReferralCode(rawCode);
  const landingPath = input.landingPath?.trim() || "/";
  const codeRecord = normalizedCode ? await getAmbassadorCodeByCode(transaction, normalizedCode) : null;
  const rejectReason = !normalizedCode
    ? "malformed_referral_code"
    : !codeRecord
      ? "invalid_referral_code"
      : codeRecord.status !== "active"
        ? "disabled_referral_code"
        : null;
  const status: ReferralClickRow["status"] = rejectReason ? "rejected" : "captured";
  const sessionId = input.anonymousSessionId?.trim() || null;

  const [row] = await transaction.query<ReferralClickRow>(
    `
      insert into public.referral_clicks (
        referral_code_id,
        referrer_user_id,
        raw_code,
        landing_path,
        query_ref,
        anonymous_session_id,
        user_agent_hash,
        ip_hash,
        first_seen_at,
        last_seen_at,
        status,
        reject_reason,
        created_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        now(),
        now(),
        $9,
        $10,
        now()
      )
      on conflict (anonymous_session_id, (upper(raw_code)), landing_path)
      where anonymous_session_id is not null
      do update set
        last_seen_at = now(),
        status = case
          when public.referral_clicks.status = 'applied' then 'applied'
          else excluded.status
        end,
        reject_reason = excluded.reject_reason
      returning id, raw_code, status, reject_reason, anonymous_session_id
    `,
    [
      codeRecord?.id ?? null,
      codeRecord?.ownerUserId ?? null,
      rawCode,
      landingPath,
      input.queryRef ?? normalizedCode,
      sessionId,
      hashNullable(input.userAgent),
      hashNullable(input.ipAddress),
      status,
      rejectReason,
    ],
  );
  if (!row) throw new Error("failed to record referral click");

  await insertReferralAuditEvent(transaction, {
    actorUserId: null,
    action: "ambassador.referral_seen",
    code: normalizedCode ?? rawCode,
    reason: rejectReason,
    context: {
      sessionId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  if (rejectReason) {
    await insertRiskFlag(transaction, {
      userId: null,
      severity: rejectReason === "disabled_referral_code" ? "medium" : "low",
      reasonCode: rejectReason,
      details: { codePrefix: rawCode.slice(0, 8), sessionHash: hashNullable(sessionId) },
    });
    return mapReferralClick(row);
  }

  if (sessionId) {
    await transaction.query(
      `
        insert into public.referral_sessions (
          anonymous_session_id,
          first_referral_click_id,
          active_referral_click_id,
          status,
          first_seen_at,
          last_seen_at
        ) values ($1, $2::uuid, $2::uuid, 'pending', now(), now())
        on conflict (anonymous_session_id)
        do update set
          last_seen_at = now(),
          active_referral_click_id = coalesce(public.referral_sessions.active_referral_click_id, excluded.active_referral_click_id)
      `,
      [sessionId, row.id],
    );
    await transaction.query(
      `
        insert into public.pending_referral_attributions (
          anonymous_session_id,
          referral_click_id,
          raw_code,
          normalized_code,
          landing_path,
          status,
          created_at,
          updated_at
        ) values ($1, $2::uuid, $3, $4, $5, 'pending', now(), now())
        on conflict (anonymous_session_id)
        where status = 'pending'
        do update set updated_at = now()
      `,
      [sessionId, row.id, rawCode, normalizedCode, landingPath],
    );
  }

  await insertReferralAuditEvent(transaction, {
    actorUserId: null,
    action: "ambassador.referral_captured",
    code: normalizedCode ?? rawCode,
    context: {
      sessionId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  return mapReferralClick(row);
};

export const getReferralAttributionForUser = async (
  executor: DatabaseExecutor,
  referredUserId: string,
): Promise<ReferralAttributionRecord | null> => {
  const [row] = await executor.query<ReferralAttributionRow>(
    `
      select id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason
      from public.referral_attributions
      where referred_user_id = $1::uuid
      limit 1
    `,
    [referredUserId],
  );
  return row ? mapAttribution(row) : null;
};

const flagReferralApplyAbuse = async (
  transaction: DatabaseTransaction,
  input: {
    referredUserId: string;
    referrerUserId: string;
    referralAttributionId: string;
    ambassadorCode: string;
    context?: ReferralApplyContext;
  },
): Promise<void> => {
  const sessionHash = hashNullable(input.context?.sessionId);
  const ipHash = hashNullable(input.context?.ipAddress);
  const [sharedLinkedWallet] = await transaction.query<{ wallet_address: string }>(
    `
      select lower(referred.wallet_address) as wallet_address
      from public.linked_wallets referred
      join public.linked_wallets referrer
        on lower(referrer.wallet_address) = lower(referred.wallet_address)
       and referrer.user_id = $2::uuid
      where referred.user_id = $1::uuid
      limit 1
    `,
    [input.referredUserId, input.referrerUserId],
  ).catch(() => []);

  if (sharedLinkedWallet) {
    await insertRiskFlag(transaction, {
      userId: input.referredUserId,
      referralAttributionId: input.referralAttributionId,
      severity: "high",
      reasonCode: "same_wallet_referral",
      details: { walletHash: hashNullable(sharedLinkedWallet.wallet_address), ambassadorCode: input.ambassadorCode },
    });
  }

  const [sharedPayoutWallet] = await transaction.query<{ wallet_address: string }>(
    `
      select lower(referred.wallet_address) as wallet_address
      from public.ambassador_payout_wallets referred
      join public.ambassador_payout_wallets referrer
        on lower(referrer.wallet_address) = lower(referred.wallet_address)
       and referrer.user_id = $2::uuid
      where referred.user_id = $1::uuid
      limit 1
    `,
    [input.referredUserId, input.referrerUserId],
  ).catch(() => []);

  if (sharedPayoutWallet) {
    await insertRiskFlag(transaction, {
      userId: input.referredUserId,
      referralAttributionId: input.referralAttributionId,
      severity: "high",
      reasonCode: "referrer_referred_share_payout_wallet",
      details: { walletHash: hashNullable(sharedPayoutWallet.wallet_address), ambassadorCode: input.ambassadorCode },
    });
  }

  if (sessionHash) {
    const [sessionAttempts] = await transaction.query<{ attempt_count: number }>(
      `
        select count(*)::int as attempt_count
        from public.audit_logs
        where action in ('ambassador.referral_captured', 'ambassador.referral_rejected', 'ambassador.referral_applied')
          and metadata->>'sessionHash' = $1
          and created_at > now() - interval '1 hour'
      `,
      [sessionHash],
    );
    if ((sessionAttempts?.attempt_count ?? 0) >= 5) {
      await insertRiskFlag(transaction, {
        userId: input.referredUserId,
        referralAttributionId: input.referralAttributionId,
        severity: "medium",
        reasonCode: "same_session_many_referral_attempts",
        details: { sessionHash, attemptCount: sessionAttempts?.attempt_count ?? 0 },
      });
    }
  }

  if (ipHash) {
    const [ipAttempts] = await transaction.query<{ attempt_count: number }>(
      `
        select count(distinct actor_user_id)::int as attempt_count
        from public.audit_logs
        where action in ('ambassador.referral_captured', 'ambassador.referral_rejected', 'ambassador.referral_applied')
          and metadata->>'ipHash' = $1
          and created_at > now() - interval '1 day'
      `,
      [ipHash],
    );
    if ((ipAttempts?.attempt_count ?? 0) >= 5) {
      await insertRiskFlag(transaction, {
        userId: input.referredUserId,
        referralAttributionId: input.referralAttributionId,
        severity: "medium",
        reasonCode: "same_ip_many_referral_accounts",
        details: { ipHash, attemptCount: ipAttempts?.attempt_count ?? 0 },
      });
    }
  }
};

export const createReferralAttribution = async (
  transaction: DatabaseTransaction,
  input: { referredUserId: string; code: string; context?: ReferralApplyContext },
): Promise<ReferralAttributionRecord> => {
  const normalizedCode = normalizeReferralCode(input.code);
  const context = input.context ?? {};
  if (!normalizedCode) {
    await insertReferralAuditEvent(transaction, {
      actorUserId: input.referredUserId,
      action: "ambassador.referral_rejected",
      code: input.code.trim().slice(0, 64),
      reason: "malformed_referral_code",
      context,
    });
    await insertRiskFlag(transaction, {
      userId: input.referredUserId,
      severity: "low",
      reasonCode: "malformed_referral_code",
      details: {
        codePrefix: input.code.trim().slice(0, 8),
        idempotencyKey: context.idempotencyKey ?? null,
        sessionHash: hashNullable(context.sessionId),
      },
    });
    throw new Error("ambassador code is malformed");
  }

  await insertReferralAuditEvent(transaction, {
    actorUserId: input.referredUserId,
    action: "ambassador.referral_seen",
    code: normalizedCode,
    context,
  });
  await insertReferralAuditEvent(transaction, {
    actorUserId: input.referredUserId,
    action: "ambassador.referral_captured",
    code: normalizedCode,
    context,
  });

  const [existing, codeRecord] = await Promise.all([
    getReferralAttributionForUser(transaction, input.referredUserId),
    getAmbassadorCodeByCode(transaction, normalizedCode),
  ]);

  const reject = async (reason: string, severity: AmbassadorRiskSeverity, details: Record<string, unknown> = {}) => {
    await insertReferralAuditEvent(transaction, {
      actorUserId: input.referredUserId,
      action: "ambassador.referral_rejected",
      code: normalizedCode,
      reason,
      referralAttributionId: existing?.id ?? null,
      context,
    });
    await insertRiskFlag(transaction, {
      userId: input.referredUserId,
      referralAttributionId: existing?.id ?? null,
      severity,
      reasonCode: reason,
      details: {
        ...details,
        idempotencyKey: context.idempotencyKey ?? null,
        sessionHash: hashNullable(context.sessionId),
        ipHash: hashNullable(context.ipAddress),
      },
    });
  };

  if (existing) {
    if (existing.ambassadorCode !== normalizedCode) {
      await reject("same_user_multiple_ref_codes", "medium", {
        existingAmbassadorCode: existing.ambassadorCode,
        attemptedAmbassadorCode: normalizedCode,
      });
    } else {
      await reject("duplicate_referral_application", "low", {
        ambassadorCode: normalizedCode,
      });
    }
    return existing;
  }

  if (!codeRecord) {
    await reject("invalid_referral_code", "low", { attemptedAmbassadorCode: normalizedCode });
    throw new Error("invalid ambassador code");
  }

  if (codeRecord.status !== "active") {
    await reject("disabled_referral_code", "medium", { codeId: codeRecord.id });
    throw new Error("ambassador code is disabled");
  }

  if (codeRecord.ownerUserId === input.referredUserId) {
    await reject("self_referral_attempt", "high", { codeId: codeRecord.id });
    throw new Error("self-referrals are not allowed");
  }

  const decision = decideReferralAttribution({
    referredUserId: input.referredUserId,
    existingAttribution: null,
    codeRecord,
  });
  if (decision.action !== "create") throw new Error("invalid referral attribution decision");

  const [inserted] = await transaction.query<ReferralAttributionRow>(
    `
      insert into public.referral_attributions (
        referred_user_id,
        referrer_user_id,
        ambassador_code,
        attributed_at,
        qualification_status,
        rejection_reason
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        now(),
        'pending',
        null
      )
      returning id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason
    `,
    [input.referredUserId, decision.referrerUserId, decision.ambassadorCode],
  );
  if (!inserted) throw new Error("failed to create referral attribution");
  const attribution = mapAttribution(inserted);

  await insertReferralAuditEvent(transaction, {
    actorUserId: input.referredUserId,
    action: "ambassador.referral_applied",
    code: normalizedCode,
    referralAttributionId: attribution.id,
    context,
  });

  await flagReferralApplyAbuse(transaction, {
    referredUserId: input.referredUserId,
    referrerUserId: attribution.referrerUserId,
    referralAttributionId: attribution.id,
    ambassadorCode: normalizedCode,
    context,
  });

  if (context.sessionId?.trim()) {
    await transaction.query(
      `
        update public.pending_referral_attributions
           set status = 'applied',
               applied_user_id = $2::uuid,
               applied_referral_attribution_id = $3::uuid,
               applied_at = now(),
               updated_at = now()
         where anonymous_session_id = $1
           and status = 'pending'
      `,
      [context.sessionId.trim(), input.referredUserId, attribution.id],
    ).catch(() => []);
    await transaction.query(
      `
        update public.referral_sessions
           set status = 'applied',
               applied_user_id = $2::uuid,
               applied_at = now(),
               last_seen_at = now()
         where anonymous_session_id = $1
           and status = 'pending'
      `,
      [context.sessionId.trim(), input.referredUserId],
    ).catch(() => []);
    await transaction.query(
      `
        update public.referral_clicks
           set status = 'applied',
               last_seen_at = now()
         where anonymous_session_id = $1
           and upper(raw_code) = upper($2)
           and status in ('seen', 'captured')
      `,
      [context.sessionId.trim(), normalizedCode],
    ).catch(() => []);
  }

  return attribution;
};

export const overrideReferralAttribution = async (
  transaction: DatabaseTransaction,
  input: {
    referredUserId: string;
    code: string;
    qualificationStatus?: ReferralQualificationStatus;
    rejectionReason?: string | null;
  },
): Promise<ReferralAttributionRecord> => {
  const codeRecord = await getAmbassadorCodeByCode(transaction, input.code);
  const decision = decideReferralAttribution({
    referredUserId: input.referredUserId,
    existingAttribution: null,
    codeRecord,
  });
  if (decision.action !== "create") throw new Error("invalid referral attribution override");

  const [row] = await transaction.query<ReferralAttributionRow>(
    `
      insert into public.referral_attributions (
        referred_user_id,
        referrer_user_id,
        ambassador_code,
        attributed_at,
        qualification_status,
        rejection_reason
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        now(),
        $4,
        $5
      )
      on conflict (referred_user_id)
      do update set
        referrer_user_id = excluded.referrer_user_id,
        ambassador_code = excluded.ambassador_code,
        qualification_status = excluded.qualification_status,
        rejection_reason = excluded.rejection_reason
      returning id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason
    `,
    [input.referredUserId, decision.referrerUserId, decision.ambassadorCode, input.qualificationStatus ?? "pending", input.rejectionReason ?? null],
  );
  if (!row) throw new Error("failed to override referral attribution");
  return mapAttribution(row);
};

export const listDirectReferrals = async (
  executor: DatabaseExecutor,
  referrerUserId: string,
): Promise<AmbassadorDirectReferralRecord[]> => {
  const rows = await executor.query<DirectReferralRow>(
    `
      select
        profile.id as user_id,
        profile.username,
        profile.display_name,
        attribution.attributed_at,
        attribution.qualification_status,
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
    [referrerUserId],
  );
  return rows.map(mapDirectReferral);
};

export const getRewardSummaryForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<AmbassadorRewardSummary> => {
  const [statusRows, [directStats]] = await Promise.all([
    executor.query<{ status: AmbassadorRewardStatus; amount: bigint }>(
      `
        select status, coalesce(sum(amount_usdc_atoms), 0::bigint) as amount
        from public.ambassador_reward_ledger
        where recipient_user_id = $1::uuid
        group by status
      `,
      [userId],
    ),
    executor.query<{ direct_referral_count: number; direct_volume: bigint }>(
      `
        select
          count(distinct attribution.referred_user_id)::int as direct_referral_count,
          coalesce(sum(trade.notional_usdc_atoms), 0::bigint) as direct_volume
        from public.referral_attributions attribution
        left join public.builder_trade_attributions trade
          on trade.user_id = attribution.referred_user_id
         and trade.direct_referrer_user_id = attribution.referrer_user_id
         and trade.status = 'confirmed'
        where attribution.referrer_user_id = $1::uuid
      `,
      [userId],
    ),
  ]);

  const amountFor = (status: AmbassadorRewardStatus): bigint =>
    statusRows.find((row) => row.status === status)?.amount ?? 0n;

  return {
    pendingRewards: amountFor("pending"),
    payableRewards: amountFor("payable"),
    approvedRewards: amountFor("approved"),
    paidRewards: amountFor("paid"),
    voidRewards: amountFor("void"),
    directReferralCount: directStats?.direct_referral_count ?? 0,
    directTradingVolumeUsdcAtoms: directStats?.direct_volume ?? 0n,
  };
};

export const listRewardLedgerForUser = async (
  executor: DatabaseExecutor,
  userId: string,
  limit = 50,
): Promise<AmbassadorRewardLedgerRecord[]> => {
  const rows = await executor.query<RewardLedgerRow>(
    `
      select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason
      from public.ambassador_reward_ledger
      where recipient_user_id = $1::uuid
      order by created_at desc, id desc
      limit $2
    `,
    [userId, limit],
  );
  return rows.map(mapRewardLedger);
};

export const listPayoutsForUser = async (
  executor: DatabaseExecutor,
  userId: string,
  limit = 20,
): Promise<AmbassadorRewardPayoutRecord[]> => {
  const rows = await executor.query<PayoutRow>(
    `
      select
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
      from public.ambassador_reward_payouts
      where recipient_user_id = $1::uuid
      order by created_at desc, id desc
      limit $2
    `,
    [userId, limit],
  );
  return rows.map(mapPayout);
};

export const readAmbassadorDashboard = async (
  transaction: DatabaseTransaction,
  userId: string,
  buildInviteUrl: (code: string) => string,
): Promise<AmbassadorDashboard> => {
  await ensureProfileForUser(transaction, userId);

  const code = await ensureAmbassadorCode(transaction, userId);
  const [attribution, directReferrals, rewards, rewardLedger, payouts] = await Promise.all([
    getReferralAttributionForUser(transaction, userId),
    listDirectReferrals(transaction, userId),
    getRewardSummaryForUser(transaction, userId),
    listRewardLedgerForUser(transaction, userId),
    listPayoutsForUser(transaction, userId),
  ]);

  return {
    ambassadorCode: {
      ...code,
      inviteUrl: buildInviteUrl(code.code),
    },
    attribution,
    directReferrals,
    rewards,
    rewardLedger,
    payouts,
  };
};

const findExistingBuilderTradeAttribution = async (
  executor: DatabaseExecutor,
  input: { polymarketOrderId?: string | null; polymarketTradeId?: string | null; sourceBuilderFeeImportId?: string | null },
): Promise<BuilderTradeAttributionRecord | null> => {
  if (!input.polymarketOrderId && !input.polymarketTradeId && !input.sourceBuilderFeeImportId) return null;

  const [row] = await executor.query<BuilderTradeAttributionRow>(
    `
      select id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at
      from public.builder_trade_attributions
      where ($1::text is not null and polymarket_order_id = $1)
         or ($2::text is not null and polymarket_trade_id = $2)
         or ($3::uuid is not null and source_builder_fee_import_id = $3::uuid)
      limit 1
    `,
    [input.polymarketOrderId ?? null, input.polymarketTradeId ?? null, input.sourceBuilderFeeImportId ?? null],
  );
  return row ? mapTradeAttribution(row) : null;
};

export const recordBuilderTradeAttribution = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    polymarketOrderId?: string | null;
    polymarketTradeId?: string | null;
    marketSlug?: string | null;
    conditionId?: string | null;
    notionalUsdcAtoms: bigint;
    builderFeeUsdcAtoms: bigint;
    status?: BuilderTradeAttributionStatus;
    rawJson?: Record<string, unknown>;
    sourceBuilderFeeImportId?: string | null;
    sourceEvidenceKey?: string | null;
  },
): Promise<BuilderTradeAttributionRecord> => {
  if (input.notionalUsdcAtoms <= 0n) throw new Error("notional must be positive");
  if (input.builderFeeUsdcAtoms <= 0n) throw new Error("builder fee must be positive");

  const existing = await findExistingBuilderTradeAttribution(transaction, input);
  if (existing) {
    if (input.status === "confirmed" && existing.status !== "confirmed") {
      const [row] = await transaction.query<BuilderTradeAttributionRow>(
        `
          update public.builder_trade_attributions
          set status = 'confirmed',
              confirmed_at = coalesce(confirmed_at, now()),
              raw_json = raw_json || $2::jsonb,
              source_builder_fee_import_id = coalesce(source_builder_fee_import_id, $3::uuid),
              source_evidence_key = coalesce(source_evidence_key, $4)
          where id = $1::uuid
          returning id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at
        `,
        [
          existing.id,
          JSON.stringify(input.rawJson ?? {}),
          input.sourceBuilderFeeImportId ?? null,
          input.sourceEvidenceKey ?? null,
        ],
      );
      if (!row) throw new Error("failed to confirm builder trade attribution");
      return mapTradeAttribution(row);
    }
    return existing;
  }

  const attribution = await getReferralAttributionForUser(transaction, input.userId);
  const directReferrerUserId = attribution?.qualificationStatus === "rejected" ? null : attribution?.referrerUserId ?? null;
  const status = input.status ?? "pending";

  const [row] = await transaction.query<BuilderTradeAttributionRow>(
    `
      insert into public.builder_trade_attributions (
        user_id,
        direct_referrer_user_id,
        polymarket_order_id,
        polymarket_trade_id,
        condition_id,
        market_slug,
        notional_usdc_atoms,
        builder_fee_usdc_atoms,
        status,
        raw_json,
        source_builder_fee_import_id,
        source_evidence_key,
        observed_at,
        confirmed_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11::uuid,
        $12,
        now(),
        case when $9 = 'confirmed' then now() else null end
      )
      returning id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at
    `,
    [
      input.userId,
      directReferrerUserId,
      input.polymarketOrderId ?? null,
      input.polymarketTradeId ?? null,
      input.conditionId ?? null,
      input.marketSlug ?? null,
      input.notionalUsdcAtoms,
      input.builderFeeUsdcAtoms,
      status,
      JSON.stringify(input.rawJson ?? {}),
      input.sourceBuilderFeeImportId ?? null,
      input.sourceEvidenceKey ?? null,
    ],
  );
  if (!row) throw new Error("failed to record builder trade attribution");
  return mapTradeAttribution(row);
};

export const recordBuilderRouteEvent = async (
  transaction: DatabaseTransaction,
  input: {
    eventId?: string | null;
    idempotencyKey?: string | null;
    eventType: string;
    appUserId?: string | null;
    walletAddress?: string | null;
    marketExternalId?: string | null;
    externalOrderId?: string | null;
    externalTradeId?: string | null;
    source?: string | null;
    builderCode?: string | null;
    side?: "maker" | "taker" | "unknown" | null;
    notionalAmountAtoms?: bigint | null;
    builderFeeBps?: number | null;
    builderFeeAmountAtoms?: bigint | null;
    asset?: string | null;
    rawReferenceId?: string | null;
    occurredAt?: string | null;
    rawJson?: Record<string, unknown>;
  },
): Promise<BuilderRouteEventRecord> => {
  const configuredBuilderCode = getPolymarketBuilderCode();
  const normalizedWallet = normalizeEvmWalletAddress(input.walletAddress);
  const builderCode = input.builderCode?.trim() || null;
  const idempotencyKey = input.idempotencyKey?.trim() || input.eventId?.trim() || crypto
    .createHash("sha256")
    .update(JSON.stringify({
      eventType: input.eventType,
      appUserId: input.appUserId ?? null,
      walletAddress: normalizedWallet,
      externalOrderId: input.externalOrderId ?? null,
      externalTradeId: input.externalTradeId ?? null,
      rawReferenceId: input.rawReferenceId ?? null,
    }))
    .digest("hex");
  const ineligibleReason = !builderCode
    ? "builder_code_missing"
    : configuredBuilderCode && builderCode.toLowerCase() !== configuredBuilderCode.toLowerCase()
      ? "builder_code_mismatch"
      : input.appUserId && input.walletAddress && !normalizedWallet
        ? "wallet_address_invalid"
        : null;
  const status: BuilderRouteEventRecord["status"] = ineligibleReason ? "ineligible" : "eligible";

  const [row] = await transaction.query<BuilderRouteEventRow>(
    `
      insert into public.builder_route_events (
        event_id,
        idempotency_key,
        event_type,
        app_user_id,
        wallet_address,
        market_external_id,
        external_order_id,
        external_trade_id,
        source,
        builder_code,
        side,
        notional_amount_atoms,
        builder_fee_bps,
        builder_fee_amount_atoms,
        asset,
        raw_reference_id,
        occurred_at,
        status,
        ineligible_reason,
        raw_json,
        ingested_at,
        created_at
      ) values (
        $1,
        $2,
        $3,
        $4::uuid,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17::timestamptz,
        $18,
        $19,
        $20::jsonb,
        now(),
        now()
      )
      on conflict (idempotency_key)
      do update set ingested_at = public.builder_route_events.ingested_at
      returning id, idempotency_key, event_type, status, ineligible_reason
    `,
    [
      input.eventId ?? null,
      idempotencyKey,
      input.eventType,
      input.appUserId ?? null,
      normalizedWallet ?? input.walletAddress ?? null,
      input.marketExternalId ?? null,
      input.externalOrderId ?? null,
      input.externalTradeId ?? null,
      input.source ?? "polymarket",
      builderCode,
      input.side ?? "unknown",
      input.notionalAmountAtoms ?? null,
      input.builderFeeBps ?? null,
      input.builderFeeAmountAtoms ?? null,
      input.asset ?? null,
      input.rawReferenceId ?? null,
      input.occurredAt ?? null,
      status,
      ineligibleReason,
      JSON.stringify(input.rawJson ?? {}),
    ],
  );
  if (!row) throw new Error("failed to record Builder route event");
  return mapBuilderRouteEvent(row);
};

export const recordBuilderFeeRevenueLedger = async (
  transaction: DatabaseTransaction,
  input: {
    tradeAttributionId: string;
    builderCode: string;
    confirmationSource: string;
    idempotencyKey: string;
    source?: string | null;
    externalOrderId?: string | null;
    externalTradeId?: string | null;
    appUserId: string;
    traderWalletAddress?: string | null;
    referrerUserId?: string | null;
    referralAttributionId?: string | null;
    marketExternalId?: string | null;
    side?: "maker" | "taker" | "unknown" | null;
    notionalAmountAtoms: bigint;
    builderFeeBps?: number | null;
    builderFeeAmountAtoms: bigint;
    asset?: string | null;
    rawJson?: Record<string, unknown>;
  },
): Promise<{ id: string }> => {
  const configuredBuilderCode = getPolymarketBuilderCode();
  if (!configuredBuilderCode || input.builderCode.toLowerCase() !== configuredBuilderCode.toLowerCase()) {
    throw new Error("builder_code_mismatch");
  }
  const [row] = await transaction.query<{ id: string }>(
    `
      insert into public.builder_fee_revenue_ledger (
        builder_trade_attribution_id,
        source,
        external_order_id,
        external_trade_id,
        app_user_id,
        trader_wallet_address,
        referrer_user_id,
        referral_attribution_id,
        builder_code,
        market_external_id,
        side,
        notional_amount_atoms,
        builder_fee_bps,
        builder_fee_amount_atoms,
        asset,
        status,
        confirmation_source,
        confirmed_at,
        idempotency_key,
        raw_json,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5::uuid,
        $6,
        $7::uuid,
        $8::uuid,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        'confirmed',
        $16,
        now(),
        $17,
        $18::jsonb,
        now(),
        now()
      )
      on conflict (idempotency_key) do update set updated_at = public.builder_fee_revenue_ledger.updated_at
      returning id
    `,
    [
      input.tradeAttributionId,
      input.source ?? "polymarket",
      input.externalOrderId ?? null,
      input.externalTradeId ?? null,
      input.appUserId,
      normalizeEvmWalletAddress(input.traderWalletAddress) ?? input.traderWalletAddress ?? null,
      input.referrerUserId ?? null,
      input.referralAttributionId ?? null,
      input.builderCode,
      input.marketExternalId ?? null,
      input.side ?? "unknown",
      input.notionalAmountAtoms,
      input.builderFeeBps ?? null,
      input.builderFeeAmountAtoms,
      input.asset ?? "pUSD",
      input.confirmationSource,
      input.idempotencyKey,
      JSON.stringify(input.rawJson ?? {}),
    ],
  );
  if (!row) throw new Error("failed to record Builder-fee revenue ledger");
  await transaction.query(
    `
      update public.ambassador_reward_ledger
         set builder_fee_revenue_ledger_id = coalesce(builder_fee_revenue_ledger_id, $2::uuid)
       where source_trade_attribution_id = $1::uuid
    `,
    [input.tradeAttributionId, row.id],
  );
  return row;
};

export const getBuilderTradeAttribution = async (
  executor: DatabaseExecutor,
  tradeAttributionId: string,
): Promise<BuilderTradeAttributionRecord | null> => {
  const [row] = await executor.query<BuilderTradeAttributionRow>(
    `
      select id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at
      from public.builder_trade_attributions
      where id = $1::uuid
      limit 1
    `,
    [tradeAttributionId],
  );
  return row ? mapTradeAttribution(row) : null;
};

export const createRewardLedgerEntries = async (
  transaction: DatabaseTransaction,
  input: {
    tradeAttributionId: string;
    config?: AmbassadorRewardsConfig;
  },
): Promise<AmbassadorRewardLedgerRecord[]> => {
  const config = input.config ?? getAmbassadorRewardsConfig();
  validateRewardShareConfig(config);
  if (!config.enabled || !config.autoCalculationEnabled) return [];

  const trade = await getBuilderTradeAttribution(transaction, input.tradeAttributionId);
  if (!trade) throw new Error("builder trade attribution not found");
  if (trade.status !== "confirmed") return [];

  const existing = await transaction.query<RewardLedgerRow>(
    `
      select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason
      from public.ambassador_reward_ledger
      where source_trade_attribution_id = $1::uuid
      order by created_at asc
    `,
    [trade.id],
  );
  if (existing.length > 0) return existing.map(mapRewardLedger);

  const drafts = calculateAmbassadorRewards({
    builderFeeUsdcAtoms: trade.builderFeeUsdcAtoms,
    traderUserId: trade.userId,
    directReferrerUserId: trade.directReferrerUserId,
    config,
  });

  for (const draft of drafts) {
    const calculationBps = draft.rewardType === "platform_revenue"
      ? (trade.directReferrerUserId ? config.platformShareBps : config.platformShareBps + config.directReferrerShareBps)
      : draft.rewardType === "direct_referrer_commission"
        ? config.directReferrerShareBps
        : config.traderCashbackShareBps;
    await transaction.query(
      `
        insert into public.ambassador_reward_ledger (
          recipient_user_id,
          source_trade_attribution_id,
          reward_type,
          amount_usdc_atoms,
          calculation_bps,
          chain_id,
          asset,
          idempotency_key,
          status,
          created_at
        ) values (
          nullif($1::uuid, $2::uuid),
          $3::uuid,
          $4,
          $5,
          $6,
          137,
          'pUSD',
          $7,
          'pending',
          now()
        )
        on conflict do nothing
      `,
      [
        draft.recipientUserId ?? zeroUuid,
        zeroUuid,
        trade.id,
        draft.rewardType,
        draft.amountUsdcAtoms,
        calculationBps,
        `reward:${trade.id}:${draft.rewardType}`,
      ],
    );
  }

  const rows = await transaction.query<RewardLedgerRow>(
    `
      select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason
      from public.ambassador_reward_ledger
      where source_trade_attribution_id = $1::uuid
      order by created_at asc
    `,
    [trade.id],
  );
  return rows.map(mapRewardLedger);
};

export const accountConfirmedBuilderTradeRewards = createRewardLedgerEntries;

export const markRewardsPayable = async (
  transaction: DatabaseTransaction,
  tradeAttributionId: string,
): Promise<AmbassadorRewardLedgerRecord[]> => {
  const trade = await getBuilderTradeAttribution(transaction, tradeAttributionId);
  if (!trade || trade.status !== "confirmed") {
    throw new Error("builder trade attribution must be confirmed before rewards become payable");
  }

  const config = getAmbassadorRewardsConfig();
  await createRewardLedgerEntries(transaction, { tradeAttributionId, config });

  await transaction.query(
    `
      update public.ambassador_reward_ledger
      set status = 'payable',
          payable_at = coalesce(payable_at, now())
      where source_trade_attribution_id = $1::uuid
        and status = 'pending'
    `,
    [tradeAttributionId],
  );

  const rows = await transaction.query<RewardLedgerRow>(
    `
      select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason
      from public.ambassador_reward_ledger
      where source_trade_attribution_id = $1::uuid
      order by created_at asc
    `,
    [tradeAttributionId],
  );
  return rows.map(mapRewardLedger);
};

export const markTradeRewardsPayable = markRewardsPayable;

export const voidRewardsForTradeAttribution = async (
  transaction: DatabaseTransaction,
  tradeAttributionId: string,
  reason: string,
): Promise<void> => {
  await transaction.query(
    `update public.builder_trade_attributions set status = 'void' where id = $1::uuid`,
    [tradeAttributionId],
  );
  await transaction.query(
    `
      update public.ambassador_reward_ledger
      set status = 'void',
          voided_at = coalesce(voided_at, now()),
          void_reason = $2
      where source_trade_attribution_id = $1::uuid
        and status <> 'paid'
    `,
    [tradeAttributionId, reason],
  );
};

export const voidBuilderTradeAttribution = voidRewardsForTradeAttribution;

export const getPayoutWalletForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<{ userId: string; chain: "polygon"; walletAddress: string; assetPreference: "pUSD" } | null> => {
  const [row] = await executor.query<PayoutWalletRow>(
    `
      select user_id, chain, wallet_address, asset_preference
      from public.ambassador_payout_wallets
      where user_id = $1::uuid
        and chain = 'polygon'
      limit 1
    `,
    [userId],
  );

  return row
    ? {
        userId: row.user_id,
        chain: row.chain,
        walletAddress: row.wallet_address,
        assetPreference: row.asset_preference,
      }
    : null;
};

export const findOpenRewardPayoutForRecipient = async (
  executor: DatabaseExecutor,
  recipientUserId: string,
): Promise<AmbassadorRewardPayoutRecord | null> => {
  const [row] = await executor.query<PayoutRow>(
    `
      select
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
      from public.ambassador_reward_payouts
      where recipient_user_id = $1::uuid
        and status in ('requested', 'approved')
      order by created_at asc
      limit 1
    `,
    [recipientUserId],
  );
  return row ? mapPayout(row) : null;
};

const insertRewardPayoutRequest = async (
  transaction: DatabaseTransaction,
  input: {
    recipientUserId: string;
    amountUsdcAtoms: bigint;
    destinationType: AmbassadorPayoutDestinationType;
    destinationValue: string;
    config: AmbassadorRewardsConfig;
  },
): Promise<AmbassadorRewardPayoutRecord> => {
  const [row] = await transaction.query<PayoutRow>(
    `
      insert into public.ambassador_reward_payouts (
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        notes,
        created_at
      ) values (
        $1::uuid,
        $2,
        'requested',
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        null,
        now()
      )
      on conflict do nothing
      returning
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
    `,
    [
      input.recipientUserId,
      input.amountUsdcAtoms,
      input.destinationType,
      input.destinationValue,
      input.config.payoutChain,
      input.config.payoutChainId,
      input.config.payoutAsset,
      input.config.payoutAssetDecimals,
      input.config.polygonPusdAddress,
    ],
  );
  if (!row) {
    const openPayout = await findOpenRewardPayoutForRecipient(transaction, input.recipientUserId);
    if (openPayout) return openPayout;
    throw new Error("failed to request reward payout");
  }
  return mapPayout(row);
};

const flagPayoutWalletReuse = async (
  transaction: DatabaseTransaction,
  input: { payoutId: string; recipientUserId: string; destinationValue: string },
): Promise<void> => {
  const wallet = normalizePayoutWalletAddress(input.destinationValue);
  const [reuse] = await transaction.query<{ account_count: number }>(
    `
      select count(distinct recipient_user_id)::int as account_count
      from public.ambassador_reward_payouts
      where lower(destination_value) = lower($1)
        and destination_type = 'wallet'
    `,
    [wallet],
  );

  if ((reuse?.account_count ?? 0) >= 3) {
    await insertRiskFlag(transaction, {
      userId: input.recipientUserId,
      payoutId: input.payoutId,
      severity: "medium",
      reasonCode: "same_payout_wallet_many_accounts",
      details: {
        walletHash: hashNullable(wallet),
        accountCount: reuse?.account_count ?? 0,
      },
    });
  }
};

export const requestRewardPayout = async (
  transaction: DatabaseTransaction,
  input: {
    recipientUserId: string;
    destinationType: AmbassadorPayoutDestinationType;
    destinationValue: string;
    allowManualDestination?: boolean;
    config?: AmbassadorRewardsConfig;
  },
): Promise<AmbassadorRewardPayoutRecord> => {
  const config = input.config ?? getAmbassadorRewardsConfig();
  validateRewardShareConfig(config);
  const summary = await getRewardSummaryForUser(transaction, input.recipientUserId);
  if (summary.payableRewards < config.minPayoutUsdcAtoms) {
    throw new Error("payable rewards are below the minimum payout threshold");
  }
  if (summary.payableRewards <= 0n) {
    throw new Error("no payable rewards available");
  }

  const openPayout = await findOpenRewardPayoutForRecipient(transaction, input.recipientUserId);
  if (openPayout) {
    throw new Error("recipient already has an open reward payout request");
  }

  if (input.destinationType === "manual") {
    if (!input.allowManualDestination) {
      throw new Error("manual payout destination is admin-only");
    }
  } else {
    normalizePayoutWalletAddress(input.destinationValue);
  }

  return insertRewardPayoutRequest(transaction, {
    recipientUserId: input.recipientUserId,
    amountUsdcAtoms: summary.payableRewards,
    destinationType: input.destinationType,
    destinationValue: input.destinationType === "wallet" ? normalizePayoutWalletAddress(input.destinationValue) : input.destinationValue.trim(),
    config,
  }).then(async (payout) => {
    await transaction.query(
      `
        update public.ambassador_reward_ledger
        set status = 'approved',
            approved_at = coalesce(approved_at, now()),
            reserved_by_payout_id = $2::uuid,
            reserved_at = coalesce(reserved_at, now())
        where recipient_user_id = $1::uuid
          and status = 'payable'
      `,
      [input.recipientUserId, payout.id],
    );

    await flagPayoutWalletReuse(transaction, {
      payoutId: payout.id,
      recipientUserId: input.recipientUserId,
      destinationValue: payout.destinationValue,
    });

    return payout;
  });
};

export const hasOpenHighSeverityRiskForPayoutApproval = async (
  transaction: DatabaseTransaction,
  payoutId: string,
): Promise<boolean> => {
  const [row] = await transaction.query<{ id: string }>(
    `
      with payout as (
        select id, recipient_user_id
        from public.ambassador_reward_payouts
        where id = $1::uuid
        limit 1
      ),
      related_trade_attributions as (
        select distinct ledger.source_trade_attribution_id as id
        from public.ambassador_reward_ledger ledger
        join payout on payout.recipient_user_id = ledger.recipient_user_id
        where ledger.status in ('payable', 'approved')
      ),
      related_referral_attributions as (
        select attribution.id
        from public.referral_attributions attribution
        join payout on attribution.referred_user_id = payout.recipient_user_id
          or attribution.referrer_user_id = payout.recipient_user_id

        union

        select attribution.id
        from related_trade_attributions related_trade
        join public.builder_trade_attributions trade_attribution
          on trade_attribution.id = related_trade.id
        join public.referral_attributions attribution
          on attribution.referred_user_id = trade_attribution.user_id
          or attribution.referrer_user_id = trade_attribution.direct_referrer_user_id
      )
      select flag.id
      from public.ambassador_risk_flags flag
      join payout on true
      where flag.status = 'open'
        and flag.severity = 'high'
        and (
          flag.user_id = payout.recipient_user_id
          or flag.payout_id = payout.id
          or flag.referral_attribution_id in (select id from related_referral_attributions)
          or flag.trade_attribution_id in (select id from related_trade_attributions)
        )
      limit 1
    `,
    [payoutId],
  );

  return Boolean(row);
};

export const assertPayoutApprovalRiskClear = async (
  transaction: DatabaseTransaction,
  payoutId: string,
): Promise<void> => {
  if (await hasOpenHighSeverityRiskForPayoutApproval(transaction, payoutId)) {
    throw new AmbassadorPayoutRiskReviewRequiredError();
  }
};

export const approveRewardPayout = async (
  transaction: DatabaseTransaction,
  input: { payoutId: string; reviewedBy: string; notes?: string | null },
): Promise<AmbassadorRewardPayoutRecord> => {
  const [existing] = await transaction.query<{ recipient_user_id: string; amount_usdc_atoms: bigint; status: string }>(
    `
      select recipient_user_id, amount_usdc_atoms, status
        from public.ambassador_reward_payouts
       where id = $1::uuid
       limit 1
    `,
    [input.payoutId],
  );
  if (!existing || existing.status !== "requested") {
    throw new Error("payout must be requested before approval");
  }

  await assertPayoutApprovalRiskClear(transaction, input.payoutId);
  const [reserved] = await transaction.query<{ amount: bigint }>(
    `
      select coalesce(sum(amount_usdc_atoms), 0::bigint) as amount
      from public.ambassador_reward_ledger
      where recipient_user_id = $1::uuid
        and status = 'approved'
        and reserved_by_payout_id = $2::uuid
    `,
    [existing.recipient_user_id, input.payoutId],
  );
  if ((reserved?.amount ?? 0n) < existing.amount_usdc_atoms) {
    throw new Error("payout amount exceeds locked rewards");
  }

  const [row] = await transaction.query<PayoutRow>(
    `
      update public.ambassador_reward_payouts
      set status = 'approved',
          reviewed_by = $2::uuid,
          reviewed_at = coalesce(reviewed_at, now()),
          notes = coalesce($3, notes)
      where id = $1::uuid
        and status = 'requested'
      returning
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
    `,
    [input.payoutId, input.reviewedBy, input.notes ?? null],
  );
  if (!row) throw new Error("payout must be requested before approval");
  return mapPayout(row);
};

export const markRewardPayoutPaid = async (
  transaction: DatabaseTransaction,
  input: { payoutId: string; reviewedBy: string; txHash?: string | null; notes?: string | null },
): Promise<AmbassadorRewardPayoutRecord> => {
  const [existing] = await transaction.query<PayoutRow>(
    `
      select
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
      from public.ambassador_reward_payouts
      where id = $1::uuid
    `,
    [input.payoutId],
  );
  if (!existing || existing.status !== "approved") {
    throw new Error("payout requires admin approval before it can be marked paid");
  }
  const txHash = existing.destination_type === "wallet" ? assertValidPayoutTxHash(input.txHash) : input.txHash?.trim() || null;

  await transaction.query(
    `
      update public.ambassador_reward_ledger
      set status = 'paid',
          paid_at = coalesce(paid_at, now())
      where reserved_by_payout_id = $1::uuid
        and status = 'approved'
    `,
    [input.payoutId],
  );

  const [row] = await transaction.query<PayoutRow>(
    `
      update public.ambassador_reward_payouts
      set status = 'paid',
          reviewed_by = coalesce(reviewed_by, $2::uuid),
          reviewed_at = coalesce(reviewed_at, now()),
          paid_at = now(),
          tx_hash = $3,
          notes = coalesce($4, notes)
      where id = $1::uuid
      returning
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
    `,
    [input.payoutId, input.reviewedBy, txHash, input.notes ?? null],
  );
  if (!row) throw new Error("failed to mark payout paid");
  return mapPayout(row);
};

export const updateRewardPayoutFailureState = async (
  transaction: DatabaseTransaction,
  input: { payoutId: string; reviewedBy: string; status: "failed" | "cancelled"; notes: string },
): Promise<AmbassadorRewardPayoutRecord> => {
  const [existing] = await transaction.query<{ recipient_user_id: string; status: string }>(
    `
      select recipient_user_id, status
      from public.ambassador_reward_payouts
      where id = $1::uuid
      limit 1
    `,
    [input.payoutId],
  );
  if (!existing || !["requested", "approved"].includes(existing.status)) {
    throw new Error("payout must be requested or approved before it can be failed or cancelled");
  }

  const [row] = await transaction.query<PayoutRow>(
    `
      update public.ambassador_reward_payouts
      set status = $3,
          reviewed_by = coalesce(reviewed_by, $2::uuid),
          reviewed_at = coalesce(reviewed_at, now()),
          notes = $4
      where id = $1::uuid
        and status in ('requested', 'approved')
      returning
        id,
        recipient_user_id,
        amount_usdc_atoms,
        status,
        destination_type,
        destination_value,
        payout_chain,
        payout_chain_id,
        payout_asset,
        payout_asset_decimals,
        asset_contract_address,
        reviewed_by,
        reviewed_at,
        paid_at,
        tx_hash,
        notes,
        created_at
    `,
    [input.payoutId, input.reviewedBy, input.status, input.notes],
  );
  if (!row) throw new Error("failed to update payout state");
  await transaction.query(
    `
      update public.ambassador_reward_ledger
      set status = 'payable',
          approved_at = null,
          reserved_by_payout_id = null,
          reserved_at = null
      where reserved_by_payout_id = $1::uuid
        and status = 'approved'
    `,
    [input.payoutId],
  );
  return mapPayout(row);
};

export const listAdminAmbassadorOverview = async (
  executor: DatabaseExecutor,
): Promise<AdminAmbassadorOverview> => {
  const [codeRows, attributionRows, tradeRows, rewardRows, payoutRows, riskFlagRows, adminAuditRows, suspiciousRows] = await Promise.all([
    executor.query<AmbassadorCodeRow>(
      `select id, code, owner_user_id, status, created_at, disabled_at from public.ambassador_codes order by created_at desc limit 100`,
    ),
    executor.query<ReferralAttributionRow>(
      `select id, referred_user_id, referrer_user_id, ambassador_code, attributed_at, qualification_status, rejection_reason from public.referral_attributions order by attributed_at desc limit 100`,
    ),
    executor.query<BuilderTradeAttributionRow>(
      `select id, user_id, direct_referrer_user_id, polymarket_order_id, polymarket_trade_id, condition_id, market_slug, notional_usdc_atoms, builder_fee_usdc_atoms, status, raw_json, observed_at, confirmed_at from public.builder_trade_attributions order by observed_at desc limit 100`,
    ),
    executor.query<RewardLedgerRow>(
      `select id, recipient_user_id, source_trade_attribution_id, reward_type, amount_usdc_atoms, status, created_at, payable_at, approved_at, paid_at, voided_at, void_reason from public.ambassador_reward_ledger order by created_at desc, id desc limit 100`,
    ),
    executor.query<PayoutRow>(
      `
        select
          id,
          recipient_user_id,
          amount_usdc_atoms,
          status,
          destination_type,
          destination_value,
          payout_chain,
          payout_chain_id,
          payout_asset,
          payout_asset_decimals,
          asset_contract_address,
          reviewed_by,
          reviewed_at,
          paid_at,
          tx_hash,
          notes,
          created_at
        from public.ambassador_reward_payouts
        order by created_at desc
        limit 100
      `,
    ),
    executor.query<RiskFlagRow>(
      `
        select
          id,
          user_id,
          referral_attribution_id,
          trade_attribution_id,
          payout_id,
          severity,
          reason_code,
          details,
          status,
          created_at,
          reviewed_by,
          reviewed_at,
          review_notes
        from public.ambassador_risk_flags
        order by created_at desc
        limit 100
      `,
    ),
    executor.query<AdminAuditLogRow>(
      `
        select id, actor_user_id, action, entity_type, entity_id, metadata, created_at
        from public.admin_audit_log
        where action like 'ambassador.%'
           or action like 'payout.%'
           or action like 'reward_ledger.%'
        order by created_at desc
        limit 100
      `,
    ).catch(() => []),
    executor.query<ReferralAttributionRow>(
      `
        select attribution.id, attribution.referred_user_id, attribution.referrer_user_id, attribution.ambassador_code, attribution.attributed_at, attribution.qualification_status, attribution.rejection_reason
        from public.referral_attributions attribution
        join public.linked_wallets referred_wallet on referred_wallet.user_id = attribution.referred_user_id
        join public.linked_wallets referrer_wallet on referrer_wallet.user_id = attribution.referrer_user_id
        where lower(referred_wallet.wallet_address) = lower(referrer_wallet.wallet_address)
        order by attribution.attributed_at desc
        limit 100
      `,
    ),
  ]);

  return {
    codes: codeRows.map(mapCode),
    attributions: attributionRows.map(mapAttribution),
    tradeAttributions: tradeRows.map(mapTradeAttribution),
    rewardLedger: rewardRows.map(mapRewardLedger),
    payouts: payoutRows.map(mapPayout),
    riskFlags: riskFlagRows.map(mapRiskFlag),
    adminAuditLog: adminAuditRows.map(mapAdminAuditLog),
    suspiciousAttributions: suspiciousRows.map(mapAttribution),
  };
};
