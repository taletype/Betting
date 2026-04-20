"use client";

import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PublicWebsocketEventSchema,
} from "@bet/contracts";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { getOrderBook, getRecentTrades } from "../../../lib/api";
import { formatPrice, formatQuantity } from "../../../lib/format";
import { OrderTicket } from "./order-ticket";
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

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

const getConnectionStatusTone = (status: ConnectionStatus): "success" | "warning" | "danger" | "neutral" => {
  if (status === "live") {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "resyncing" || status === "reconnecting") {
    return "warning";
  }

  return "neutral";
};

const getMarketStatusTone = (status: string): "success" | "warning" | "neutral" => {
  if (status === "resolved") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  return "neutral";
};

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
    console.warn("market.websocket.resync_requested", { marketId: market.id });
    setConnectionStatus("resyncing");
    socketRef.current?.close();

    try {
      const [orderBook, recentTrades] = await Promise.all([getOrderBook(market.id), getRecentTrades(market.id)]);

      setRealtimeState(createMarketRealtimeState(orderBook, recentTrades));
      console.info("market.websocket.resync_completed", { marketId: market.id });
      setConnectionStatus("reconnecting");
    } catch (error) {
      console.error("failed to resync market state", error);
      console.error("market.websocket.resync_failed", {
        marketId: market.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
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
            console.warn("market.websocket.sequence_gap_detected", {
              marketId: market.id,
              lastSequence: currentState.lastSequence?.toString() ?? null,
              eventType: event.type,
              eventSequence: event.sequence.toString(),
            });
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

      {market.status === "resolved" ? (
        <section className="banner banner-success">
          This market is resolved. Trading is closed and payouts can now be claimed from your portfolio.
        </section>
      ) : null}

      {connectionStatus === "error" ? (
        <section className="error-state">
          Realtime feed disconnected. Data shown may be stale while the app attempts to reconnect.
        </section>
      ) : null}

      {market.status !== "resolved" && (
        <OrderTicket marketId={market.id} outcomes={market.outcomes} />
      )}

      <section className="grid">
        <div className="panel stack">
          <strong>Market Details</strong>
          <div className={`badge badge-${getMarketStatusTone(market.status)}`}>Market {market.status}</div>
          <div className="kv">
            <span className="kv-key">Collateral</span>
            <span className="kv-value">{market.collateralCurrency}</span>
          </div>
          <div className="kv">
            <span className="kv-key">Trading closes</span>
            <span className="kv-value">{market.closesAt ? formatTimestamp(market.closesAt) : "—"}</span>
          </div>
          <div className="kv">
            <span className="kv-key">Resolution time</span>
            <span className="kv-value">{market.resolvesAt ? formatTimestamp(market.resolvesAt) : "—"}</span>
          </div>
        </div>

        <div className="panel stack">
          <strong>Market Stats</strong>
          <div className="kv">
            <span className="kv-key">Best bid</span>
            <span className="kv-value">{formatPrice(market.stats.bestBid)}</span>
          </div>
          <div className="kv">
            <span className="kv-key">Best ask</span>
            <span className="kv-value">{formatPrice(market.stats.bestAsk)}</span>
          </div>
          <div className="kv">
            <span className="kv-key">Last trade</span>
            <span className="kv-value">{formatPrice(market.stats.lastTradePrice)}</span>
          </div>
          <div className="kv">
            <span className="kv-key">Total volume</span>
            <span className="kv-value">{market.stats.volumeNotional.toString()}</span>
          </div>
        </div>

        <div className="panel stack">
          <strong>Outcomes</strong>
          {market.outcomes.length === 0 ? (
            <div className="empty-state">No outcomes configured for this market.</div>
          ) : (
            market.outcomes.map((outcome) => (
              <div key={outcome.id} className="panel" style={{ minHeight: "auto", padding: "10px 12px" }}>
                {outcome.title}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="stack">
        <h2 className="section-title">Order Book</h2>
        <div className="grid">
          {market.outcomes.map((outcome) => {
            const levels = levelsByOutcomeId.get(outcome.id) ?? { buy: [], sell: [] };

            return (
              <div className="panel stack" key={outcome.id}>
                <strong>{outcome.title}</strong>
                <div className="stack">
                  <div className="badge badge-success">Buy orders (bids)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Price</th>
                        <th>Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levels.buy.length > 0 ? (
                        levels.buy.map((level) => (
                          <tr key={`${level.side}-${level.priceTicks.toString()}`}>
                            <td>{formatPrice(level.priceTicks)}</td>
                            <td>{formatQuantity(level.quantityAtoms)}</td>
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
                  <div className="badge badge-danger">Sell orders (asks)</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Price</th>
                        <th>Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levels.sell.length > 0 ? (
                        levels.sell.map((level) => (
                          <tr key={`${level.side}-${level.priceTicks.toString()}`}>
                            <td>{formatPrice(level.priceTicks)}</td>
                            <td>{formatQuantity(level.quantityAtoms)}</td>
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
        <h2 className="section-title">Recent Trades</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Outcome</th>
              <th>Side</th>
              <th>Price</th>
              <th>Shares</th>
            </tr>
          </thead>
          <tbody>
            {realtimeState.recentTrades.trades.length > 0 ? (
              realtimeState.recentTrades.trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{formatTimestamp(trade.executedAt)}</td>
                  <td>{outcomeTitleById.get(trade.outcomeId) ?? trade.outcomeId}</td>
                  <td>{trade.takerSide ? trade.takerSide.charAt(0).toUpperCase() + trade.takerSide.slice(1) : "—"}</td>
                  <td>{formatPrice(trade.priceTicks)}</td>
                  <td>{formatQuantity(trade.quantityAtoms)}</td>
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
