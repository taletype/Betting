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
  code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
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

export const ApiAmbassadorCodeSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1),
  ownerUserId: UuidSchema,
  status: z.enum(["active", "disabled"]),
  inviteUrl: z.string().min(1),
  createdAt: TimestampSchema,
  disabledAt: TimestampSchema.nullable(),
});

export const ApiReferralAttributionSchema = z.object({
  id: UuidSchema,
  referredUserId: UuidSchema,
  referrerUserId: UuidSchema,
  ambassadorCode: z.string().min(1),
  attributedAt: TimestampSchema,
  qualificationStatus: z.enum(["pending", "qualified", "rejected"]),
  rejectionReason: z.string().nullable(),
});

export const ApiAmbassadorDirectReferralSchema = z.object({
  userId: UuidSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  attributedAt: TimestampSchema,
  qualificationStatus: z.enum(["pending", "qualified", "rejected"]),
  tradingVolumeUsdcAtoms: BigIntStringSchema,
});

export const ApiBuilderTradeAttributionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  directReferrerUserId: UuidSchema.nullable(),
  polymarketOrderId: z.string().nullable(),
  polymarketTradeId: z.string().nullable(),
  conditionId: z.string().nullable(),
  marketSlug: z.string().nullable(),
  notionalUsdcAtoms: BigIntStringSchema,
  builderFeeUsdcAtoms: BigIntStringSchema,
  status: z.enum(["pending", "confirmed", "void"]),
  rawJson: z.record(z.unknown()),
  observedAt: TimestampSchema,
  confirmedAt: TimestampSchema.nullable(),
});

export const ApiAmbassadorRewardLedgerSchema = z.object({
  id: UuidSchema,
  recipientUserId: UuidSchema.nullable(),
  sourceTradeAttributionId: UuidSchema,
  rewardType: z.enum(["platform_revenue", "direct_referrer_commission", "trader_cashback"]),
  amountUsdcAtoms: BigIntStringSchema,
  status: z.enum(["pending", "payable", "approved", "paid", "void"]),
  createdAt: TimestampSchema,
  payableAt: TimestampSchema.nullable(),
  approvedAt: TimestampSchema.nullable(),
  paidAt: TimestampSchema.nullable(),
  voidedAt: TimestampSchema.nullable(),
  voidReason: z.string().nullable(),
});

export const ApiAmbassadorRewardSummarySchema = z.object({
  pendingRewards: BigIntStringSchema,
  payableRewards: BigIntStringSchema,
  approvedRewards: BigIntStringSchema,
  paidRewards: BigIntStringSchema,
  voidRewards: BigIntStringSchema,
  directReferralCount: z.number().int().nonnegative(),
  directTradingVolumeUsdcAtoms: BigIntStringSchema,
});

export const ApiAmbassadorRewardPayoutSchema = z.object({
  id: UuidSchema,
  recipientUserId: UuidSchema,
  amountUsdcAtoms: BigIntStringSchema,
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

export const GetAmbassadorDashboardResponseSchema = z.object({
  ambassadorCode: ApiAmbassadorCodeSchema,
  attribution: ApiReferralAttributionSchema.nullable(),
  directReferrals: z.array(ApiAmbassadorDirectReferralSchema),
  rewards: ApiAmbassadorRewardSummarySchema,
  rewardLedger: z.array(ApiAmbassadorRewardLedgerSchema),
  payouts: z.array(ApiAmbassadorRewardPayoutSchema),
});

export const GetAdminAmbassadorOverviewResponseSchema = z.object({
  codes: z.array(ApiAmbassadorCodeSchema.omit({ inviteUrl: true })),
  attributions: z.array(ApiReferralAttributionSchema),
  tradeAttributions: z.array(ApiBuilderTradeAttributionSchema),
  rewardLedger: z.array(ApiAmbassadorRewardLedgerSchema),
  payouts: z.array(ApiAmbassadorRewardPayoutSchema),
  riskFlags: z.array(z.object({
    id: UuidSchema,
    userId: UuidSchema.nullable(),
    referralAttributionId: UuidSchema.nullable(),
    tradeAttributionId: UuidSchema.nullable(),
    payoutId: UuidSchema.nullable(),
    severity: z.enum(["low", "medium", "high"]),
    reasonCode: z.string(),
    details: z.unknown(),
    status: z.enum(["open", "reviewed", "dismissed"]),
    createdAt: TimestampSchema,
    reviewedBy: UuidSchema.nullable(),
    reviewedAt: TimestampSchema.nullable(),
    reviewNotes: z.string().nullable(),
  })).default([]),
  suspiciousAttributions: z.array(ApiReferralAttributionSchema),
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

export const ApiExternalImportedTradeSchema = z.object({
  externalTradeId: z.string().min(1),
  externalOutcomeId: z.string().nullable(),
  source: ApiExternalSourceSchema,
  side: OrderSideSchema.nullable(),
  price: z.number().nullable(),
  pricePpm: BigIntStringSchema.nullable(),
  size: z.number().nullable(),
  sizeAtoms: BigIntStringSchema.nullable(),
  executedAt: TimestampSchema,
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
export const GetExternalMarketTradesBySourceAndIdResponseSchema = z.object({
  source: ApiExternalSourceSchema,
  externalId: z.string().min(1),
  trades: z.array(ApiExternalImportedTradeSchema),
});

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
export type GetAmbassadorDashboardResponse = z.infer<typeof GetAmbassadorDashboardResponseSchema>;
export type GetAdminAmbassadorOverviewResponse = z.infer<typeof GetAdminAmbassadorOverviewResponseSchema>;
export type GetExternalMarketsResponse = z.infer<typeof GetExternalMarketsResponseSchema>;
export type GetExternalMarketBySourceAndIdResponse = z.infer<typeof GetExternalMarketBySourceAndIdResponseSchema>;
export type GetExternalMarketTradesBySourceAndIdResponse = z.infer<typeof GetExternalMarketTradesBySourceAndIdResponseSchema>;
