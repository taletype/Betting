import { z } from "zod";

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime();
const BigIntStringSchema = z.string().regex(/^-?\d+$/);

export const MarketStatusSchema = z.enum(["draft", "open", "halted", "resolved", "cancelled"]);
export const ExternalMarketStatusSchema = z.enum(["open", "closed", "resolved", "cancelled"]);
export const OrderSideSchema = z.enum(["buy", "sell"]);
export const OrderTypeSchema = z.enum(["limit", "market"]);
export const OrderStatusSchema = z.enum(["pending", "open", "partially_filled", "filled", "cancelled", "rejected"]);
export const ClaimStatusSchema = z.enum(["pending", "claimable", "claimed", "blocked"]);
export const WithdrawalStatusSchema = z.enum(["requested", "completed", "failed"]);
export const ApiExternalSourceSchema = z.enum(["polymarket", "kalshi"]);

export const ApiErrorResponseSchema = z.object({
  error: z.string().min(1),
});

export const ApiHealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("api"),
  checkedAt: TimestampSchema,
});

export const ApiReadyResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("api"),
  ready: z.literal(true),
  checkedAt: TimestampSchema,
});

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

export const ApiWithdrawalSchema = z.object({
  id: UuidSchema,
  amountAtoms: BigIntStringSchema,
  destinationAddress: z.string().min(1),
  status: WithdrawalStatusSchema,
  requestedAt: TimestampSchema,
  processedAt: TimestampSchema.nullable(),
  txHash: z.string().nullable(),
});

export const GetPortfolioResponseSchema = z.object({
  balances: z.array(ApiPortfolioBalanceSchema),
  openOrders: z.array(ApiOrderSchema),
  positions: z.array(ApiPositionSchema),
  claims: z.array(ApiClaimSchema),
  linkedWallet: ApiLinkedWalletSchema.nullable(),
  deposits: z.array(ApiDepositRecordSchema),
  withdrawals: z.array(ApiWithdrawalSchema),
});

export const GetClaimsResponseSchema = z.object({
  claims: z.array(ApiClaimSchema),
  states: z.array(
    z.object({
      marketId: UuidSchema,
      resolutionId: UuidSchema.nullable(),
      claimableAmount: BigIntStringSchema,
      claimedAmount: BigIntStringSchema,
      status: ClaimStatusSchema,
    }),
  ),
});

export const GetClaimStateByMarketResponseSchema = z.object({
  marketId: UuidSchema,
  resolutionId: UuidSchema.nullable(),
  claimableAmount: BigIntStringSchema,
  claimedAmount: BigIntStringSchema,
  status: z.enum(["blocked", "claimable", "claimed"]),
});

export const PostClaimByMarketResponseSchema = z.object({
  claim: ApiClaimSchema,
  payoutJournalId: UuidSchema,
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

export const ApiReferralCodeSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1),
  inviteUrl: z.string().min(1),
  createdAt: TimestampSchema,
});

export const ApiReferralSponsorSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  referralCode: z.string().nullable(),
  assignedAt: TimestampSchema,
});

export const ApiReferralMemberSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  joinedAt: TimestampSchema,
});

export const ApiMlmDashboardMetricsSchema = z.object({
  directReferralCount: z.number().int().nonnegative(),
  totalDownlineCount: z.number().int().nonnegative(),
  lifetimeCommission: BigIntStringSchema,
  recentCommission30d: BigIntStringSchema,
});

export const ApiMlmCommissionPlanLevelSchema = z.object({
  id: UuidSchema,
  levelDepth: z.number().int().positive(),
  rateBps: z.number().int().nonnegative(),
});

export const ApiMlmCommissionPlanSchema = z.object({
  id: UuidSchema,
  version: z.number().int().positive(),
  name: z.string().min(1),
  payableDepth: z.number().int().positive(),
  isActive: z.boolean(),
  activatedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  levels: z.array(ApiMlmCommissionPlanLevelSchema),
});

export const ApiMlmCommissionEventSchema = z.object({
  id: UuidSchema,
  depositId: UuidSchema,
  sourceUserId: UuidSchema,
  sourceDisplayName: z.string().nullable(),
  beneficiaryUserId: UuidSchema,
  levelDepth: z.number().int().positive(),
  amount: BigIntStringSchema,
  currency: z.string().min(1),
  payoutStatus: z.enum(["credited", "skipped"]),
  createdAt: TimestampSchema,
  journalId: UuidSchema.nullable(),
});

export const GetMlmDashboardResponseSchema = z.object({
  referralCode: ApiReferralCodeSchema,
  sponsor: ApiReferralSponsorSchema.nullable(),
  directReferrals: z.array(ApiReferralMemberSchema),
  metrics: ApiMlmDashboardMetricsSchema,
  commissions: z.array(ApiMlmCommissionEventSchema),
});

export const ApiAdminReferralRelationshipSchema = z.object({
  id: UuidSchema,
  referredUserId: UuidSchema,
  referredDisplayName: z.string().nullable(),
  sponsorUserId: UuidSchema,
  sponsorDisplayName: z.string().nullable(),
  referralCode: z.string().nullable(),
  source: z.enum(["invite_code", "admin_override"]),
  assignedAt: TimestampSchema,
});

export const GetAdminMlmOverviewResponseSchema = z.object({
  activePlan: ApiMlmCommissionPlanSchema.nullable(),
  plans: z.array(ApiMlmCommissionPlanSchema),
  recentCommissions: z.array(ApiMlmCommissionEventSchema),
  relationships: z.array(ApiAdminReferralRelationshipSchema),
});

export const CreateWithdrawalRequestSchema = z.object({
  amountAtoms: BigIntStringSchema,
  destinationAddress: z.string().min(1),
});

export const GetWithdrawalsResponseSchema = z.object({
  withdrawals: z.array(ApiWithdrawalSchema),
});

export const PostWithdrawalsResponseSchema = ApiWithdrawalSchema;

export const AdminResolveMarketRequestSchema = z.object({
  winningOutcomeId: UuidSchema,
  evidenceText: z.string().min(1),
  evidenceUrl: z.string().url().nullable().optional(),
  resolverId: z.string().min(1),
});

export const AdminResolveMarketResponseSchema = z.object({
  marketId: UuidSchema,
  status: z.literal("resolved"),
  resolution: z.object({
    id: UuidSchema,
    marketId: UuidSchema,
    status: z.enum(["pending", "proposed", "finalized", "cancelled"]),
    winningOutcomeId: UuidSchema.nullable(),
    resolvedAt: TimestampSchema.nullable(),
    evidenceUrl: z.string().url().nullable(),
    notes: z.string(),
  }),
});

export const AdminExecuteWithdrawalRequestSchema = z.object({
  txHash: z.string().min(1),
});

export const AdminFailWithdrawalRequestSchema = z.object({
  reason: z.string().min(1),
});

export const AdminWithdrawalActionResponseSchema = ApiWithdrawalSchema;

export const ApiExternalOutcomeSchema = z.object({
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

export const ApiExternalTradeSchema = z.object({
  externalTradeId: z.string().min(1),
  externalOutcomeId: z.string().nullable(),
  side: OrderSideSchema.nullable(),
  price: z.number().nullable(),
  size: z.number().nullable(),
  tradedAt: TimestampSchema,
});

export const ApiExternalMarketSchema = z.object({
  id: UuidSchema,
  source: ApiExternalSourceSchema,
  externalId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: ExternalMarketStatusSchema,
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
  outcomes: z.array(ApiExternalOutcomeSchema),
  recentTrades: z.array(ApiExternalTradeSchema),
});

export const GetExternalMarketsResponseSchema = z.array(ApiExternalMarketSchema);
export const GetExternalMarketBySourceAndIdResponseSchema = z.object({ market: ApiExternalMarketSchema.nullable() });

export type ApiHealthResponse = z.infer<typeof ApiHealthResponseSchema>;
export type ApiReadyResponse = z.infer<typeof ApiReadyResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type GetMarketsResponse = z.infer<typeof GetMarketsResponseSchema>;
export type GetMarketByIdResponse = z.infer<typeof GetMarketByIdResponseSchema>;
export type GetOrderBookResponse = z.infer<typeof GetOrderBookResponseSchema>;
export type GetMarketTradesResponse = z.infer<typeof GetMarketTradesResponseSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type PostOrdersResponse = z.infer<typeof PostOrdersResponseSchema>;
export type DeleteOrderResponse = z.infer<typeof DeleteOrderResponseSchema>;
export type GetPortfolioResponse = z.infer<typeof GetPortfolioResponseSchema>;
export type GetClaimsResponse = z.infer<typeof GetClaimsResponseSchema>;
export type GetClaimStateByMarketResponse = z.infer<typeof GetClaimStateByMarketResponseSchema>;
export type PostClaimByMarketResponse = z.infer<typeof PostClaimByMarketResponseSchema>;
export type VerifyDepositRequest = z.infer<typeof VerifyDepositRequestSchema>;
export type VerifyDepositResponse = z.infer<typeof VerifyDepositResponseSchema>;
export type GetDepositsResponse = z.infer<typeof GetDepositsResponseSchema>;
export type CreateWithdrawalRequest = z.infer<typeof CreateWithdrawalRequestSchema>;
export type GetWithdrawalsResponse = z.infer<typeof GetWithdrawalsResponseSchema>;
export type PostWithdrawalsResponse = z.infer<typeof PostWithdrawalsResponseSchema>;
export type AdminResolveMarketRequest = z.infer<typeof AdminResolveMarketRequestSchema>;
export type AdminResolveMarketResponse = z.infer<typeof AdminResolveMarketResponseSchema>;
export type AdminExecuteWithdrawalRequest = z.infer<typeof AdminExecuteWithdrawalRequestSchema>;
export type AdminFailWithdrawalRequest = z.infer<typeof AdminFailWithdrawalRequestSchema>;
export type AdminWithdrawalActionResponse = z.infer<typeof AdminWithdrawalActionResponseSchema>;
export type GetExternalMarketsResponse = z.infer<typeof GetExternalMarketsResponseSchema>;
export type GetExternalMarketBySourceAndIdResponse = z.infer<typeof GetExternalMarketBySourceAndIdResponseSchema>;
