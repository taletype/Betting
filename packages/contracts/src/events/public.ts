import { z } from "zod";

import { MarketSchema, TradeSchema } from "../schemas/core";

export const PublicMarketSnapshotEventSchema = z.object({
  type: z.literal("market.snapshot"),
  market: MarketSchema,
  sequence: z.bigint(),
});

export const PublicTradeCreatedEventSchema = z.object({
  type: z.literal("trade.created"),
  trade: TradeSchema,
  sequence: z.bigint(),
});

export const PublicOrderBookUpdatedEventSchema = z.object({
  type: z.literal("orderbook.updated"),
  marketId: z.string().uuid(),
  outcomeId: z.string().uuid(),
  sequence: z.bigint(),
  bids: z.array(z.tuple([z.bigint(), z.bigint()])),
  asks: z.array(z.tuple([z.bigint(), z.bigint()])),
});

export const PublicWebsocketEventSchema = z.discriminatedUnion("type", [
  PublicMarketSnapshotEventSchema,
  PublicTradeCreatedEventSchema,
  PublicOrderBookUpdatedEventSchema,
]);

export type PublicWebsocketEvent = z.infer<typeof PublicWebsocketEventSchema>;
