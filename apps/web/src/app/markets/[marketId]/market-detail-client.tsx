"use client";

import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PublicWebsocketEventSchema,
} from "@bet/contracts";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { getOrderBook, getRecentTrades } from "../../../lib/api";
import {
  applyMarketRealtimeMessage,
  createMarketRealtimeState,
  getMarketWebSocketUrl,
} from "../../../lib/market-realtime";

interface MarketDetailClientProps {
  initialMarketJson: string;
  initialOrderBookJson: string;
  initialRecentTradesJson: string;
}

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "resyncing" | "error";

const formatTicks = (value: bigint | null): string => (value === null ? "—" : value.toString());

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

export function MarketDetailClient({
  initialMarketJson,
  initialOrderBookJson,
  initialRecentTradesJson,
}: MarketDetailClientProps) {
  const [{ initialOrderBook, initialRecentTrades, market }] = useState(() => ({
    initialOrderBook: OrderBookSchema.parse(JSON.parse(initialOrderBookJson)),
    initialRecentTrades: MarketTradesSchema.parse(JSON.parse(initialRecentTradesJson)),
    market: MarketSnapshotSchema.parse(JSON.parse(initialMarketJson)),
  }));
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [realtimeState, setRealtimeState] = useState(() =>
    createMarketRealtimeState(initialOrderBook, initialRecentTrades),
  );
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncingRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);

  const scheduleReconnect = useEffectEvent((delayMs: number) => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimerRef.current = setTimeout(() => {
      startTransition(() => {
        setConnectionAttempt((value) => value + 1);
      });
    }, delayMs);
  });

  const beginResync = useEffectEvent(async () => {
    if (resyncingRef.current) {
      return;
    }

    resyncingRef.current = true;
    setConnectionStatus("resyncing");
    socketRef.current?.close();

    try {
      const [orderBook, recentTrades] = await Promise.all([
        getOrderBook(market.id),
        getRecentTrades(market.id),
      ]);

      setRealtimeState(createMarketRealtimeState(orderBook, recentTrades));
      setConnectionStatus("reconnecting");
    } catch (error) {
      console.error("failed to resync market state", error);
      setConnectionStatus("error");
    } finally {
      resyncingRef.current = false;
      scheduleReconnect(250);
    }
  });

  useEffect(() => {
    setConnectionStatus(connectionAttempt === 0 ? "connecting" : "reconnecting");

    const socket = new WebSocket(getMarketWebSocketUrl());
    socketRef.current = socket;
    let active = true;

    socket.addEventListener("open", () => {
      if (!active) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "market.subscribe",
          marketId: market.id,
          channels: ["orderbook", "trades"],
        }),
      );
    });

    socket.addEventListener("message", (messageEvent) => {
      if (!active) {
        return;
      }

      try {
        const event = PublicWebsocketEventSchema.parse(JSON.parse(String(messageEvent.data)));

        if (event.type === "system.error") {
          console.error("market websocket error", event.message);
          setConnectionStatus("error");
          return;
        }

        setRealtimeState((currentState) => {
          const result = applyMarketRealtimeMessage(currentState, event);

          if (result.shouldResync) {
            queueMicrotask(() => {
              void beginResync();
            });

            return currentState;
          }

          return result.nextState;
        });

        setConnectionStatus("live");
      } catch (error) {
        console.error("failed to parse market websocket payload", error);
        queueMicrotask(() => {
          void beginResync();
        });
      }
    });

    socket.addEventListener("close", () => {
      if (!active || resyncingRef.current) {
        return;
      }

      setConnectionStatus("reconnecting");
      scheduleReconnect(1000);
    });

    socket.addEventListener("error", () => {
      if (!active) {
        return;
      }

      setConnectionStatus("error");
    });

    return () => {
      active = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      socket.close();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [beginResync, connectionAttempt, market.id, scheduleReconnect]);

  const levelsByOutcomeId = new Map<
    string,
    {
      buy: typeof realtimeState.orderBook.levels;
      sell: typeof realtimeState.orderBook.levels;
    }
  >();

  for (const outcome of market.outcomes) {
    levelsByOutcomeId.set(outcome.id, { buy: [], sell: [] });
  }

  for (const level of realtimeState.orderBook.levels) {
    const group = levelsByOutcomeId.get(level.outcomeId) ?? { buy: [], sell: [] };
    group[level.side].push(level);
    levelsByOutcomeId.set(level.outcomeId, group);
  }

  const outcomeTitleById = new Map(market.outcomes.map((outcome) => [outcome.id, outcome.title]));

  return (
    <main className="stack">
      <section className="hero">
        <h1>{market.title}</h1>
        <p>{market.description}</p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>Market</strong>
          <div className="muted">Status: {market.status}</div>
          <div className="muted">Collateral: {market.collateralCurrency}</div>
          <div className="muted">Closes: {market.closesAt ? formatTimestamp(market.closesAt) : "—"}</div>
          <div className="muted">Resolves: {market.resolvesAt ? formatTimestamp(market.resolvesAt) : "—"}</div>
          <div className="muted">Realtime: {connectionStatus}</div>
        </div>
        <div className="panel stack">
          <strong>Stats</strong>
          <div className="muted">Best bid: {formatTicks(market.stats.bestBid)}</div>
          <div className="muted">Best ask: {formatTicks(market.stats.bestAsk)}</div>
          <div className="muted">Last trade: {formatTicks(market.stats.lastTradePrice)}</div>
          <div className="muted">Volume: {market.stats.volumeNotional.toString()}</div>
        </div>
        <div className="panel stack">
          <strong>Outcomes</strong>
          {market.outcomes.map((outcome) => (
            <div key={outcome.id} className="muted">
              {outcome.title}
            </div>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2>Order Book</h2>
        <div className="grid">
          {market.outcomes.map((outcome) => {
            const levels = levelsByOutcomeId.get(outcome.id) ?? { buy: [], sell: [] };

            return (
              <div className="panel stack" key={outcome.id}>
                <strong>{outcome.title}</strong>
                <div className="stack">
                  <div className="muted">Bids</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Price</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levels.buy.length > 0 ? (
                        levels.buy.map((level) => (
                          <tr key={`${level.side}-${level.priceTicks.toString()}`}>
                            <td>{level.priceTicks.toString()}</td>
                            <td>{level.quantityAtoms.toString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="muted">
                            No resting bids.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="stack">
                  <div className="muted">Asks</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Price</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levels.sell.length > 0 ? (
                        levels.sell.map((level) => (
                          <tr key={`${level.side}-${level.priceTicks.toString()}`}>
                            <td>{level.priceTicks.toString()}</td>
                            <td>{level.quantityAtoms.toString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="muted">
                            No resting asks.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel stack">
        <h2>Recent Trades</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Outcome</th>
              <th>Taker side</th>
              <th>Price</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {realtimeState.recentTrades.trades.length > 0 ? (
              realtimeState.recentTrades.trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{formatTimestamp(trade.executedAt)}</td>
                  <td>{outcomeTitleById.get(trade.outcomeId) ?? trade.outcomeId}</td>
                  <td>{trade.takerSide ?? "—"}</td>
                  <td>{trade.priceTicks.toString()}</td>
                  <td>{trade.quantityAtoms.toString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  No trades yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
