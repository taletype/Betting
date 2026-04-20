import type {
  PrivateWebsocketEvent,
  PublicMarketNotification,
  PublicWebsocketEvent,
} from "@bet/contracts";
import { createDatabaseClient, type DatabaseClient } from "@bet/db";
import { logger } from "@bet/observability";

export interface RealtimePublication {
  channel: string;
  event: PublicWebsocketEvent | PrivateWebsocketEvent | PublicMarketNotification;
}

export interface RealtimePublisher {
  publish(publications: readonly RealtimePublication[]): Promise<void>;
}

export const PRIVATE_USER_CHANNEL_PREFIX = "realtime.private.user";

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

export const createRealtimePublisher = (
  db: DatabaseClient = createDatabaseClient(),
): RealtimePublisher => ({
  async publish(publications) {
    for (const publication of publications) {
      const payload = toJson(publication.event);
      await db.query("select pg_notify($1, $2)", [publication.channel, payload]);
      logger.info("trading.realtime.published", {
        channel: publication.channel,
        type: publication.event.type,
      });
    }
  },
});
