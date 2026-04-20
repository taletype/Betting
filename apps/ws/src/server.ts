import { createServer } from "node:http";

import {
  PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL,
  PublicMarketNotificationSchema,
  PublicWebsocketClientMessageSchema,
  type PublicMarketChannel,
  type PublicWebsocketEvent,
} from "@bet/contracts";
import { createDatabaseNotificationClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import {
  createPublicMarketSnapshotEvents,
  eventMatchesPublicMarketChannels,
  loadPublicMarketSnapshot,
  loadPublicOrderbook,
} from "./channels/public-market";

interface PublicMarketSubscriptionState {
  bufferedEvents: PublicWebsocketEvent[];
  channels: Set<PublicMarketChannel>;
  ready: boolean;
}

interface ConnectionState {
  publicMarkets: Map<string, PublicMarketSubscriptionState>;
  socket: WebSocket;
}

const port = Number(process.env.PORT ?? 4001);
const subscriptionsByMarketId = new Map<string, Set<ConnectionState>>();
const connectionStates = new WeakMap<WebSocket, ConnectionState>();

const stringifyMessage = (value: unknown): string =>
  JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

const sendEvent = (socket: WebSocket, event: PublicWebsocketEvent): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(stringifyMessage(event));
};

const sendError = (socket: WebSocket, message: string): void => {
  sendEvent(socket, {
    type: "system.error",
    message,
  });
};

const readRawMessage = (payload: RawData): string => {
  if (typeof payload === "string") {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf8");
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }

  return Buffer.from(payload).toString("utf8");
};

const getSequencedEventValue = (event: PublicWebsocketEvent): bigint | null => {
  if (event.type === "system.error") {
    return null;
  }

  return event.sequence;
};

const ensureMarketSubscriptionSet = (marketId: string): Set<ConnectionState> => {
  const existing = subscriptionsByMarketId.get(marketId);

  if (existing) {
    return existing;
  }

  const next = new Set<ConnectionState>();
  subscriptionsByMarketId.set(marketId, next);
  return next;
};

const removePublicMarketSubscription = (connection: ConnectionState, marketId: string): void => {
  connection.publicMarkets.delete(marketId);

  const subscribers = subscriptionsByMarketId.get(marketId);
  if (!subscribers) {
    return;
  }

  subscribers.delete(connection);

  if (subscribers.size === 0) {
    subscriptionsByMarketId.delete(marketId);
  }
};

const flushBufferedEvents = (
  connection: ConnectionState,
  marketId: string,
  snapshotSequence: bigint,
): void => {
  const subscription = connection.publicMarkets.get(marketId);

  if (!subscription) {
    return;
  }

  const bufferedCount = subscription.bufferedEvents.length;
  subscription.bufferedEvents
    .sort((left, right) => {
      const leftSequence = getSequencedEventValue(left) ?? 0n;
      const rightSequence = getSequencedEventValue(right) ?? 0n;
      return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
    })
    .forEach((event) => {
      const sequence = getSequencedEventValue(event);

      if (sequence !== null && sequence <= snapshotSequence) {
        return;
      }

      if (!eventMatchesPublicMarketChannels(event, subscription.channels)) {
        return;
      }

      sendEvent(connection.socket, event);
    });

  subscription.bufferedEvents = [];

  if (bufferedCount > 0) {
    incrementCounter("websocket_resync_events_total", {
      marketId,
    });
    logger.info("websocket buffered events flushed", {
      marketId,
      bufferedCount,
      snapshotSequence: snapshotSequence.toString(),
    });
  }
};

const handlePublicMarketSubscribe = async (
  connection: ConnectionState,
  marketId: string,
  channels: readonly PublicMarketChannel[],
): Promise<void> => {
  const subscription: PublicMarketSubscriptionState = {
    bufferedEvents: [],
    channels: new Set(channels),
    ready: false,
  };

  connection.publicMarkets.set(marketId, subscription);
  ensureMarketSubscriptionSet(marketId).add(connection);

  try {
    const snapshot = await loadPublicMarketSnapshot(marketId);

    for (const event of createPublicMarketSnapshotEvents(snapshot, subscription.channels)) {
      sendEvent(connection.socket, event);
    }

    subscription.ready = true;
    flushBufferedEvents(connection, marketId, snapshot.sequence);
  } catch (error) {
    incrementCounter("websocket_subscribe_failures_total", {
      marketId,
    });
    removePublicMarketSubscription(connection, marketId);
    const message = error instanceof Error ? error.message : "failed to subscribe to market";
    logger.error("websocket market subscribe failed", {
      marketId,
      error: message,
    });
    sendError(connection.socket, message);
  }
};

const broadcastPublicMarketEvent = async (event: PublicWebsocketEvent): Promise<void> => {
  if (event.type === "system.error") {
    return;
  }

  const subscribers = subscriptionsByMarketId.get(event.marketId);

  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const connection of subscribers) {
    const subscription = connection.publicMarkets.get(event.marketId);

    if (!subscription) {
      continue;
    }

    if (!eventMatchesPublicMarketChannels(event, subscription.channels)) {
      continue;
    }

    if (!subscription.ready) {
      subscription.bufferedEvents.push(event);
      continue;
    }

    sendEvent(connection.socket, event);
  }
};

const handleNotification = async (payload: string): Promise<void> => {
  const notification = PublicMarketNotificationSchema.parse(JSON.parse(payload));

  if (notification.type === "market.orderbook.changed") {
    const orderbook = await loadPublicOrderbook(notification.marketId);

    await broadcastPublicMarketEvent({
      type: "market.orderbook.delta",
      marketId: notification.marketId,
      orderbook,
      sequence: notification.sequence,
    });
    return;
  }

  await broadcastPublicMarketEvent({
    type: "market.trade.executed",
    marketId: notification.marketId,
    sequence: notification.sequence,
    trade: notification.trade,
  });
};

const cleanupConnection = (socket: WebSocket): void => {
  const connection = connectionStates.get(socket);

  if (!connection) {
    return;
  }

  for (const marketId of connection.publicMarkets.keys()) {
    removePublicMarketSubscription(connection, marketId);
  }
};

export const main = async (): Promise<void> => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.statusCode = 404;
    response.end("Not found");
  });

  const notificationClient = await createDatabaseNotificationClient();
  await notificationClient.query(`listen ${PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL}`);
  notificationClient.on("notification", (notification: { payload?: string | null }) => {
    if (!notification.payload) {
      return;
    }

    void handleNotification(notification.payload).catch((error) => {
      incrementCounter("websocket_notification_failures_total", {
        stage: "handle_notification",
      });
      logger.error("websocket notification handling failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
      console.error("failed to handle market notification", error);
    });
  });

  const websocketServer = new WebSocketServer({ noServer: true });

  websocketServer.on("connection", (socket: WebSocket) => {
    incrementCounter("websocket_connections_total", {
      event: "opened",
    });
    const connection: ConnectionState = {
      publicMarkets: new Map(),
      socket,
    };

    connectionStates.set(socket, connection);

    socket.on("message", (rawMessage: RawData) => {
      void (async () => {
        try {
          const message = PublicWebsocketClientMessageSchema.parse(JSON.parse(readRawMessage(rawMessage)));

          if (message.type === "market.subscribe") {
            await handlePublicMarketSubscribe(connection, message.marketId, message.channels);
            return;
          }

          removePublicMarketSubscription(connection, message.marketId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "invalid websocket message";
          sendError(socket, message);
        }
      })();
    });

    socket.on("close", () => {
      incrementCounter("websocket_connections_total", {
        event: "closed",
      });
      cleanupConnection(socket);
    });

    socket.on("error", () => {
      incrementCounter("websocket_connections_total", {
        event: "errored",
      });
      cleanupConnection(socket);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (client: WebSocket) => {
      websocketServer.emit("connection", client, request);
    });
  });

  server.listen(port, () => {
    console.log(`WS listening on ws://localhost:${port}/ws`);
  });
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
