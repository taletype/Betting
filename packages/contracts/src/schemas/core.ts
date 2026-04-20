import { z } from "zod";

export const MoneySchema = z.bigint();
export const QuantitySchema = z.bigint();
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

export type Market = z.infer<typeof MarketSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ExternalMarket = z.infer<typeof ExternalMarketSchema>;
export type ExternalOutcome = z.infer<typeof ExternalOutcomeSchema>;
export type ExternalTradeTick = z.infer<typeof ExternalTradeTickSchema>;
