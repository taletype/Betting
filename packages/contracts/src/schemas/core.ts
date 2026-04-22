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

export const ReferralCodeSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1),
  inviteUrl: z.string().min(1),
  createdAt: TimestampSchema,
});

export const ReferralSponsorSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  referralCode: z.string().nullable(),
  assignedAt: TimestampSchema,
});

export const ReferralMemberSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  joinedAt: TimestampSchema,
});

export const MlmCommissionPlanLevelSchema = z.object({
  id: UuidSchema,
  levelDepth: z.number().int().positive(),
  rateBps: z.number().int().nonnegative(),
});

export const MlmCommissionPlanSchema = z.object({
  id: UuidSchema,
  version: z.number().int().positive(),
  name: z.string().min(1),
  payableDepth: z.number().int().positive(),
  isActive: z.boolean(),
  activatedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  levels: z.array(MlmCommissionPlanLevelSchema).default([]),
});

export const MlmCommissionEventSchema = z.object({
  id: UuidSchema,
  depositId: UuidSchema,
  sourceUserId: UuidSchema,
  sourceDisplayName: z.string().nullable(),
  beneficiaryUserId: UuidSchema,
  levelDepth: z.number().int().positive(),
  amount: MoneySchema,
  currency: z.string().min(1),
  payoutStatus: z.enum(["credited", "skipped"]),
  createdAt: TimestampSchema,
  journalId: UuidSchema.nullable(),
});

export const MlmDashboardMetricsSchema = z.object({
  directReferralCount: z.number().int().nonnegative(),
  totalDownlineCount: z.number().int().nonnegative(),
  lifetimeCommission: MoneySchema,
  recentCommission30d: MoneySchema,
});

export const MlmDashboardSchema = z.object({
  referralCode: ReferralCodeSchema,
  sponsor: ReferralSponsorSchema.nullable(),
  directReferrals: z.array(ReferralMemberSchema).default([]),
  metrics: MlmDashboardMetricsSchema,
  commissions: z.array(MlmCommissionEventSchema).default([]),
});

export const AdminReferralRelationshipSchema = z.object({
  id: UuidSchema,
  referredUserId: UuidSchema,
  referredDisplayName: z.string().nullable(),
  sponsorUserId: UuidSchema,
  sponsorDisplayName: z.string().nullable(),
  referralCode: z.string().nullable(),
  source: z.enum(["invite_code", "admin_override"]),
  assignedAt: TimestampSchema,
});

export const AdminMlmOverviewSchema = z.object({
  activePlan: MlmCommissionPlanSchema.nullable(),
  plans: z.array(MlmCommissionPlanSchema).default([]),
  recentCommissions: z.array(MlmCommissionEventSchema).default([]),
  relationships: z.array(AdminReferralRelationshipSchema).default([]),
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
export type ReferralCode = z.infer<typeof ReferralCodeSchema>;
export type ReferralSponsor = z.infer<typeof ReferralSponsorSchema>;
export type ReferralMember = z.infer<typeof ReferralMemberSchema>;
export type MlmCommissionPlanLevel = z.infer<typeof MlmCommissionPlanLevelSchema>;
export type MlmCommissionPlan = z.infer<typeof MlmCommissionPlanSchema>;
export type MlmCommissionEvent = z.infer<typeof MlmCommissionEventSchema>;
export type MlmDashboard = z.infer<typeof MlmDashboardSchema>;
export type AdminReferralRelationship = z.infer<typeof AdminReferralRelationshipSchema>;
export type AdminMlmOverview = z.infer<typeof AdminMlmOverviewSchema>;
