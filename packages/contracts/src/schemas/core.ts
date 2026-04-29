import { z } from "zod";

const BigIntSchema = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/)])
  .transform((value) => (typeof value === "bigint" ? value : BigInt(value)));

export const MoneySchema = BigIntSchema;
export const QuantitySchema = BigIntSchema;
export const SequenceSchema = BigIntSchema;
export const TimestampSchema = z.string().datetime();
export const UuidSchema = z.string().uuid();

export const OutcomeSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  index: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const MarketSchema = z.object({
  id: UuidSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["draft", "open", "halted", "resolved", "cancelled"]),
  collateralCurrency: z.string().default("USD"),
  minPrice: MoneySchema,
  maxPrice: MoneySchema,
  tickSize: MoneySchema,
  createdAt: TimestampSchema,
  closesAt: TimestampSchema.nullable(),
  resolvesAt: TimestampSchema.nullable(),
  outcomes: z.array(OutcomeSchema).default([]),
});


export const ExternalSourceSchema = z.enum(["polymarket", "kalshi"]);

export const ExternalOutcomeSchema = z.object({
  externalOutcomeId: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  index: z.number().int().nonnegative(),
  yesNo: z.enum(["yes", "no"]).nullable(),
  bestBid: z.number().nullable(),
  bestAsk: z.number().nullable(),
  lastPrice: z.number().nullable(),
  volume: z.number().nullable(),
});

export const ExternalTradeTickSchema = z.object({
  externalTradeId: z.string().min(1),
  externalOutcomeId: z.string().nullable(),
  side: z.enum(["buy", "sell"]).nullable(),
  price: z.number().nullable(),
  size: z.number().nullable(),
  tradedAt: TimestampSchema,
});

export const ExternalMarketSchema = z.object({
  id: UuidSchema,
  source: ExternalSourceSchema,
  externalId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: z.enum(["open", "closed", "resolved", "cancelled"]),
  marketUrl: z.string().nullable(),
  closeTime: TimestampSchema.nullable(),
  endTime: TimestampSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
  bestBid: z.number().nullable(),
  bestAsk: z.number().nullable(),
  lastTradePrice: z.number().nullable(),
  volume24h: z.number().nullable(),
  volumeTotal: z.number().nullable(),
  lastSyncedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  outcomes: z.array(ExternalOutcomeSchema).default([]),
  recentTrades: z.array(ExternalTradeTickSchema).default([]),
});

export const OrderSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  userId: UuidSchema,
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["limit", "market"]),
  status: z.enum(["pending", "open", "partially_filled", "filled", "cancelled", "rejected"]),
  price: MoneySchema,
  quantity: QuantitySchema,
  remainingQuantity: QuantitySchema,
  reservedAmount: MoneySchema,
  clientOrderId: z.string().min(1).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const TradeSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  makerOrderId: UuidSchema,
  takerOrderId: UuidSchema,
  price: MoneySchema,
  quantity: QuantitySchema,
  notional: MoneySchema,
  matchedAt: TimestampSchema,
});

export const PositionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  netQuantity: QuantitySchema,
  averageEntryPrice: MoneySchema,
  realizedPnl: MoneySchema,
  updatedAt: TimestampSchema,
});

export const ResolutionSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  status: z.enum(["pending", "proposed", "finalized", "cancelled"]),
  winningOutcomeId: UuidSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
  evidenceUrl: z.string().url().nullable(),
  notes: z.string().default(""),
});

export const ClaimSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  marketId: UuidSchema,
  resolutionId: UuidSchema,
  claimableAmount: MoneySchema,
  claimedAmount: MoneySchema,
  status: z.enum(["pending", "claimable", "claimed", "blocked"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const MarketStatsSchema = z.object({
  bestBid: MoneySchema.nullable(),
  bestAsk: MoneySchema.nullable(),
  lastTradePrice: MoneySchema.nullable(),
  volumeNotional: MoneySchema,
});

export const MarketSnapshotSchema = MarketSchema.extend({
  stats: MarketStatsSchema,
});

export const OrderBookLevelSchema = z.object({
  outcomeId: UuidSchema,
  side: z.enum(["buy", "sell"]),
  priceTicks: MoneySchema,
  quantityAtoms: QuantitySchema,
});

export const OrderBookSchema = z.object({
  marketId: UuidSchema,
  levels: z.array(OrderBookLevelSchema),
});

export const RecentTradeSchema = z.object({
  id: UuidSchema,
  outcomeId: UuidSchema,
  priceTicks: MoneySchema,
  quantityAtoms: QuantitySchema,
  takerSide: z.enum(["buy", "sell"]).nullable(),
  executedAt: TimestampSchema,
});

export const MarketTradesSchema = z.object({
  marketId: UuidSchema,
  trades: z.array(RecentTradeSchema),
});


export const LinkedWalletSchema = z.object({
  id: UuidSchema,
  chain: z.literal("base"),
  walletAddress: z.string().min(1),
  verifiedAt: TimestampSchema,
});

export const DepositRecordSchema = z.object({
  id: UuidSchema,
  chain: z.literal("base"),
  txHash: z.string().min(1),
  txSender: z.string().min(1),
  txRecipient: z.string().min(1),
  tokenAddress: z.string().min(1),
  amount: MoneySchema,
  currency: z.string().min(1),
  txStatus: z.enum(["confirmed", "rejected"]),
  blockNumber: MoneySchema,
  createdAt: TimestampSchema,
  verifiedAt: TimestampSchema,
});


export const WithdrawalRecordSchema = z.object({
  id: UuidSchema,
  amountAtoms: MoneySchema,
  destinationAddress: z.string().min(1),
  status: z.enum(["requested", "completed", "failed"]),
  requestedAt: TimestampSchema,
  processedAt: TimestampSchema.nullable(),
  txHash: z.string().nullable(),
});

export const PortfolioBalanceSchema = z.object({
  currency: z.string().min(1),
  available: MoneySchema,
  reserved: MoneySchema,
});

export const PortfolioSnapshotSchema = z.object({
  balances: z.array(PortfolioBalanceSchema),
  openOrders: z.array(OrderSchema),
  positions: z.array(PositionSchema),
  claims: z.array(ClaimSchema),
  linkedWallet: LinkedWalletSchema.nullable().default(null),
  deposits: z.array(DepositRecordSchema).default([]),
  withdrawals: z.array(WithdrawalRecordSchema).default([]),
});

export const AmbassadorCodeSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1),
  ownerUserId: UuidSchema,
  status: z.enum(["active", "disabled"]),
  inviteUrl: z.string().min(1),
  createdAt: TimestampSchema,
  disabledAt: TimestampSchema.nullable(),
});

export const ReferralAttributionSchema = z.object({
  id: UuidSchema,
  referredUserId: UuidSchema,
  referrerUserId: UuidSchema,
  ambassadorCode: z.string().min(1),
  attributedAt: TimestampSchema,
  qualificationStatus: z.enum(["pending", "qualified", "rejected"]),
  rejectionReason: z.string().nullable(),
});

export const AmbassadorDirectReferralSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  attributedAt: TimestampSchema,
  qualificationStatus: z.enum(["pending", "qualified", "rejected"]),
  tradingVolumeUsdcAtoms: MoneySchema,
});

export const BuilderTradeAttributionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  directReferrerUserId: UuidSchema.nullable(),
  polymarketOrderId: z.string().nullable(),
  polymarketTradeId: z.string().nullable(),
  conditionId: z.string().nullable(),
  marketSlug: z.string().nullable(),
  notionalUsdcAtoms: MoneySchema,
  builderFeeUsdcAtoms: MoneySchema,
  status: z.enum(["pending", "confirmed", "void"]),
  rawJson: z.record(z.unknown()),
  observedAt: TimestampSchema,
  confirmedAt: TimestampSchema.nullable(),
});

export const AmbassadorRewardLedgerSchema = z.object({
  id: UuidSchema,
  recipientUserId: UuidSchema.nullable(),
  sourceTradeAttributionId: UuidSchema,
  rewardType: z.enum(["platform_revenue", "direct_referrer_commission", "trader_cashback"]),
  amountUsdcAtoms: MoneySchema,
  status: z.enum(["pending", "payable", "approved", "paid", "void"]),
  createdAt: TimestampSchema,
  payableAt: TimestampSchema.nullable(),
  approvedAt: TimestampSchema.nullable(),
  paidAt: TimestampSchema.nullable(),
  voidedAt: TimestampSchema.nullable(),
  voidReason: z.string().nullable(),
});

export const AmbassadorRewardSummarySchema = z.object({
  pendingRewards: MoneySchema,
  payableRewards: MoneySchema,
  approvedRewards: MoneySchema,
  paidRewards: MoneySchema,
  voidRewards: MoneySchema,
  directReferralCount: z.number().int().nonnegative(),
  directTradingVolumeUsdcAtoms: MoneySchema,
});

export const AmbassadorRewardPayoutSchema = z.object({
  id: UuidSchema,
  recipientUserId: UuidSchema,
  amountUsdcAtoms: MoneySchema,
  status: z.enum(["requested", "approved", "paid", "failed", "cancelled"]),
  destinationType: z.enum(["wallet", "manual"]),
  destinationValue: z.string().min(1),
  payoutChain: z.literal("polygon"),
  payoutChainId: z.literal(137),
  payoutAsset: z.literal("pUSD"),
  payoutAssetDecimals: z.literal(6),
  assetContractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  reviewedBy: UuidSchema.nullable(),
  reviewedAt: TimestampSchema.nullable(),
  paidAt: TimestampSchema.nullable(),
  txHash: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: TimestampSchema,
});

export const AmbassadorDashboardSchema = z.object({
  ambassadorCode: AmbassadorCodeSchema,
  attribution: ReferralAttributionSchema.nullable(),
  directReferrals: z.array(AmbassadorDirectReferralSchema).default([]),
  rewards: AmbassadorRewardSummarySchema,
  rewardLedger: z.array(AmbassadorRewardLedgerSchema).default([]),
  payouts: z.array(AmbassadorRewardPayoutSchema).default([]),
});

export const AdminAmbassadorOverviewSchema = z.object({
  codes: z.array(AmbassadorCodeSchema.omit({ inviteUrl: true })).default([]),
  attributions: z.array(ReferralAttributionSchema).default([]),
  tradeAttributions: z.array(BuilderTradeAttributionSchema).default([]),
  rewardLedger: z.array(AmbassadorRewardLedgerSchema).default([]),
  payouts: z.array(AmbassadorRewardPayoutSchema).default([]),
  suspiciousAttributions: z.array(ReferralAttributionSchema).default([]),
});

export type Market = z.infer<typeof MarketSchema>;
export type MarketStats = z.infer<typeof MarketStatsSchema>;
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;
export type OrderBook = z.infer<typeof OrderBookSchema>;
export type RecentTrade = z.infer<typeof RecentTradeSchema>;
export type MarketTrades = z.infer<typeof MarketTradesSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ExternalMarket = z.infer<typeof ExternalMarketSchema>;
export type ExternalOutcome = z.infer<typeof ExternalOutcomeSchema>;
export type ExternalTradeTick = z.infer<typeof ExternalTradeTickSchema>;
export type LinkedWallet = z.infer<typeof LinkedWalletSchema>;
export type DepositRecord = z.infer<typeof DepositRecordSchema>;
export type WithdrawalRecord = z.infer<typeof WithdrawalRecordSchema>;
export type PortfolioBalance = z.infer<typeof PortfolioBalanceSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type AmbassadorCode = z.infer<typeof AmbassadorCodeSchema>;
export type ReferralAttribution = z.infer<typeof ReferralAttributionSchema>;
export type AmbassadorDirectReferral = z.infer<typeof AmbassadorDirectReferralSchema>;
export type BuilderTradeAttribution = z.infer<typeof BuilderTradeAttributionSchema>;
export type AmbassadorRewardLedger = z.infer<typeof AmbassadorRewardLedgerSchema>;
export type AmbassadorRewardSummary = z.infer<typeof AmbassadorRewardSummarySchema>;
export type AmbassadorRewardPayout = z.infer<typeof AmbassadorRewardPayoutSchema>;
export type AmbassadorDashboard = z.infer<typeof AmbassadorDashboardSchema>;
export type AdminAmbassadorOverview = z.infer<typeof AdminAmbassadorOverviewSchema>;
