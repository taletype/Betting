"use client";

import type { MarketTrades, OrderBook, PublicWebsocketEvent } from "@bet/contracts";

export interface MarketRealtimeState {
  lastSequence: bigint | null;
  orderBook: OrderBook;
  recentTrades: MarketTrades;
}

const RECENT_TRADES_LIMIT = 50;

export const createMarketRealtimeState = (
  orderBook: OrderBook,
  recentTrades: MarketTrades,
): MarketRealtimeState => ({
  lastSequence: null,
  orderBook,
  recentTrades,
});

export const applyMarketRealtimeMessage = (
  state: MarketRealtimeState,
  event: PublicWebsocketEvent,
): { nextState: MarketRealtimeState; shouldResync: boolean } => {
  if (event.type === "system.error") {
    return {
      nextState: state,
      shouldResync: false,
    };
  }

  if (event.type === "market.orderbook.snapshot") {
    if (state.lastSequence !== null && event.sequence < state.lastSequence) {
      return {
        nextState: state,
        shouldResync: false,
      };
    }

    return {
      nextState: {
        ...state,
        lastSequence: event.sequence,
        orderBook: event.orderbook,
      },
      shouldResync: false,
    };
  }

  if (event.type === "market.trades.snapshot") {
    if (state.lastSequence !== null && event.sequence < state.lastSequence) {
      return {
        nextState: state,
        shouldResync: false,
      };
    }

    return {
      nextState: {
        ...state,
        lastSequence: event.sequence,
        recentTrades: event.trades,
      },
      shouldResync: false,
    };
  }

  if (state.lastSequence === null || event.sequence !== state.lastSequence + 1n) {
    return {
      nextState: state,
      shouldResync: true,
    };
  }

  if (event.type === "market.orderbook.delta") {
    return {
      nextState: {
        ...state,
        lastSequence: event.sequence,
        orderBook: event.orderbook,
      },
      shouldResync: false,
    };
  }

  return {
    nextState: {
      ...state,
      lastSequence: event.sequence,
      recentTrades: {
        marketId: state.recentTrades.marketId,
        trades: [event.trade, ...state.recentTrades.trades].slice(0, RECENT_TRADES_LIMIT),
      },
    },
    shouldResync: false,
  };
};

export const getMarketWebSocketUrl = (): string => {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:4001/ws";

  if (configuredUrl.endsWith("/ws")) {
    return configuredUrl;
  }

  return `${configuredUrl.replace(/\/$/, "")}/ws`;
};
