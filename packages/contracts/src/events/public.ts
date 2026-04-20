import { z } from "zod";

import {
  MarketTradesSchema,
  OrderBookSchema,
  RecentTradeSchema,
  SequenceSchema,
  UuidSchema,
} from "../schemas/core";

export const PublicMarketChannelSchema = z.enum(["orderbook", "trades"]);
export const PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL = "public_market_events";

export const PublicMarketSubscribeMessageSchema = z.object({
  type: z.literal("market.subscribe"),
  marketId: UuidSchema,
  channels: z.array(PublicMarketChannelSchema).min(1),
});

export const PublicMarketUnsubscribeMessageSchema = z.object({
  type: z.literal("market.unsubscribe"),
  marketId: UuidSchema,
});

export const PublicWebsocketClientMessageSchema = z.discriminatedUnion("type", [
  PublicMarketSubscribeMessageSchema,
  PublicMarketUnsubscribeMessageSchema,
]);

export const PublicOrderBookSnapshotEventSchema = z.object({
  type: z.literal("market.orderbook.snapshot"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
  orderbook: OrderBookSchema,
});

export const PublicOrderBookDeltaEventSchema = z.object({
  type: z.literal("market.orderbook.delta"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
  orderbook: OrderBookSchema,
});

export const PublicTradesSnapshotEventSchema = z.object({
  type: z.literal("market.trades.snapshot"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
  trades: MarketTradesSchema,
});

export const PublicTradeExecutedEventSchema = z.object({
  type: z.literal("market.trade.executed"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
  trade: RecentTradeSchema,
});

export const PublicErrorEventSchema = z.object({
  type: z.literal("system.error"),
  message: z.string().min(1),
});

export const PublicWebsocketEventSchema = z.discriminatedUnion("type", [
  PublicOrderBookSnapshotEventSchema,
  PublicOrderBookDeltaEventSchema,
  PublicTradesSnapshotEventSchema,
  PublicTradeExecutedEventSchema,
  PublicErrorEventSchema,
]);

export const PublicOrderBookChangedNotificationSchema = z.object({
  type: z.literal("market.orderbook.changed"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
});

export const PublicTradeExecutedNotificationSchema = z.object({
  type: z.literal("market.trade.executed"),
  marketId: UuidSchema,
  sequence: SequenceSchema,
  trade: RecentTradeSchema,
});

export const PublicMarketNotificationSchema = z.discriminatedUnion("type", [
  PublicOrderBookChangedNotificationSchema,
  PublicTradeExecutedNotificationSchema,
]);

export type PublicMarketChannel = z.infer<typeof PublicMarketChannelSchema>;
export type PublicWebsocketClientMessage = z.infer<typeof PublicWebsocketClientMessageSchema>;
export type PublicWebsocketEvent = z.infer<typeof PublicWebsocketEventSchema>;
export type PublicMarketNotification = z.infer<typeof PublicMarketNotificationSchema>;
