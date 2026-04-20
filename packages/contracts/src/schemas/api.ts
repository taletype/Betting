import { z } from "zod";

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime();
const BigIntStringSchema = z.string().regex(/^-?\d+$/);

const MarketStatusSchema = z.enum(["draft", "open", "halted", "resolved", "cancelled"]);
const OrderSideSchema = z.enum(["buy", "sell"]);
const OrderTypeSchema = z.enum(["limit", "market"]);
const OrderStatusSchema = z.enum(["pending", "open", "partially_filled", "filled", "cancelled", "rejected"]);
const ClaimStatusSchema = z.enum(["pending", "claimable", "claimed", "blocked"]);

export const ApiOutcomeSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  index: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const ApiMarketStatsSchema = z.object({
  bestBid: BigIntStringSchema.nullable(),
  bestAsk: BigIntStringSchema.nullable(),
  lastTradePrice: BigIntStringSchema.nullable(),
  volumeNotional: BigIntStringSchema,
});

export const ApiMarketSnapshotSchema = z.object({
  id: UuidSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: MarketStatusSchema,
  collateralCurrency: z.string().min(1),
  minPrice: BigIntStringSchema,
  maxPrice: BigIntStringSchema,
  tickSize: BigIntStringSchema,
  createdAt: TimestampSchema,
  closesAt: TimestampSchema.nullable(),
  resolvesAt: TimestampSchema.nullable(),
  outcomes: z.array(ApiOutcomeSchema),
  stats: ApiMarketStatsSchema,
});

export const GetMarketsResponseSchema = z.array(ApiMarketSnapshotSchema);
export const GetMarketByIdResponseSchema = z.object({ market: ApiMarketSnapshotSchema.nullable() });

export const ApiOrderBookLevelSchema = z.object({
  outcomeId: UuidSchema,
  side: OrderSideSchema,
  priceTicks: BigIntStringSchema,
  quantityAtoms: BigIntStringSchema,
});

export const GetOrderBookResponseSchema = z.object({
  marketId: UuidSchema,
  levels: z.array(ApiOrderBookLevelSchema),
});

export const ApiRecentTradeSchema = z.object({
  id: UuidSchema,
  outcomeId: UuidSchema,
  priceTicks: BigIntStringSchema,
  quantityAtoms: BigIntStringSchema,
  takerSide: OrderSideSchema.nullable(),
  executedAt: TimestampSchema,
});

export const GetMarketTradesResponseSchema = z.object({
  marketId: UuidSchema,
  trades: z.array(ApiRecentTradeSchema),
});

export const CreateOrderRequestSchema = z.object({
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  side: OrderSideSchema,
  orderType: OrderTypeSchema,
  price: BigIntStringSchema,
  quantity: BigIntStringSchema,
  clientOrderId: z.string().min(1).nullable().optional(),
});

export const ApiOrderSchema = z.object({
  id: UuidSchema,
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  userId: UuidSchema,
  side: OrderSideSchema,
  orderType: OrderTypeSchema,
  status: OrderStatusSchema,
  price: BigIntStringSchema,
  quantity: BigIntStringSchema,
  remainingQuantity: BigIntStringSchema,
  reservedAmount: BigIntStringSchema,
  clientOrderId: z.string().min(1).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const ApiTradeSummarySchema = z.object({
  id: UuidSchema,
  makerOrderId: UuidSchema,
  takerOrderId: UuidSchema,
  price: BigIntStringSchema,
  quantity: BigIntStringSchema,
  notional: BigIntStringSchema,
  sequence: BigIntStringSchema,
  matchedAt: TimestampSchema,
});

export const ApiOrderJournalSummarySchema = z.object({
  journal: z.unknown(),
  entryCount: z.number().int().nonnegative(),
  balanceDeltas: z.record(BigIntStringSchema),
});

export const PostOrdersResponseSchema = z.object({
  order: ApiOrderSchema,
  reserve: ApiOrderJournalSummarySchema,
  status: OrderStatusSchema,
  trades: z.array(ApiTradeSummarySchema),
});

export const DeleteOrderResponseSchema = z.object({
  order: ApiOrderSchema,
  release: ApiOrderJournalSummarySchema,
  status: z.literal("cancelled"),
});

export const ApiPortfolioBalanceSchema = z.object({
  currency: z.string().min(1),
  available: BigIntStringSchema,
  reserved: BigIntStringSchema,
});

export const ApiPositionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  marketId: UuidSchema,
  outcomeId: UuidSchema,
  netQuantity: BigIntStringSchema,
  averageEntryPrice: BigIntStringSchema,
  realizedPnl: BigIntStringSchema,
  updatedAt: TimestampSchema,
});

export const ApiClaimSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  marketId: UuidSchema,
  resolutionId: UuidSchema.nullable(),
  claimableAmount: BigIntStringSchema,
  claimedAmount: BigIntStringSchema,
  status: ClaimStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const ApiLinkedWalletSchema = z.object({
  id: UuidSchema,
  chain: z.literal("base"),
  walletAddress: z.string().min(1),
  verifiedAt: TimestampSchema,
});

export const ApiDepositRecordSchema = z.object({
  id: UuidSchema,
  chain: z.literal("base"),
  txHash: z.string().min(1),
  txSender: z.string().min(1),
  txRecipient: z.string().min(1),
  tokenAddress: z.string().min(1),
  amount: BigIntStringSchema,
  currency: z.string().min(1),
  txStatus: z.enum(["confirmed", "rejected"]),
  blockNumber: BigIntStringSchema,
  createdAt: TimestampSchema,
  verifiedAt: TimestampSchema,
});

export const GetPortfolioResponseSchema = z.object({
  balances: z.array(ApiPortfolioBalanceSchema),
  openOrders: z.array(ApiOrderSchema),
  positions: z.array(ApiPositionSchema),
  claims: z.array(ApiClaimSchema),
  linkedWallet: ApiLinkedWalletSchema.nullable(),
  deposits: z.array(ApiDepositRecordSchema),
});

export const VerifyDepositRequestSchema = z.object({
  txHash: z.string().min(1),
});

export const VerifyDepositResponseSchema = z.object({
  status: z.enum(["accepted", "already_credited"]),
  deposit: ApiDepositRecordSchema,
});

export const GetDepositsResponseSchema = z.object({
  deposits: z.array(ApiDepositRecordSchema),
});

export type GetMarketsResponse = z.infer<typeof GetMarketsResponseSchema>;
export type GetMarketByIdResponse = z.infer<typeof GetMarketByIdResponseSchema>;
export type GetOrderBookResponse = z.infer<typeof GetOrderBookResponseSchema>;
export type GetMarketTradesResponse = z.infer<typeof GetMarketTradesResponseSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type PostOrdersResponse = z.infer<typeof PostOrdersResponseSchema>;
export type DeleteOrderResponse = z.infer<typeof DeleteOrderResponseSchema>;
export type GetPortfolioResponse = z.infer<typeof GetPortfolioResponseSchema>;
export type VerifyDepositRequest = z.infer<typeof VerifyDepositRequestSchema>;
export type VerifyDepositResponse = z.infer<typeof VerifyDepositResponseSchema>;
export type GetDepositsResponse = z.infer<typeof GetDepositsResponseSchema>;
