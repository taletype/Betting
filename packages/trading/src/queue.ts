import { createDatabaseClient, type DatabaseClient, type DatabaseExecutor } from "@bet/db";
import type { OrderSubmittedForMatchingCommand } from "@bet/contracts";

import {
  claimNextSubmittedOrderMatchingCommand,
  enqueueSubmittedOrderMatchingCommand,
  markSubmittedOrderMatchingCommandFailed,
  markSubmittedOrderMatchingCommandProcessed,
  type ClaimedOrderMatchingCommand,
} from "./repository";

export interface SubmittedOrderMatchingQueue {
  enqueue(executor: DatabaseExecutor, command: OrderSubmittedForMatchingCommand): Promise<void>;
  claimNext(): Promise<ClaimedOrderMatchingCommand | null>;
  markProcessed(input: { commandId: string; claimToken: string; processedAt: string }): Promise<void>;
  markFailed(input: { commandId: string; claimToken: string; errorMessage: string }): Promise<void>;
}

export interface SubmittedOrderMatchingQueueOptions {
  db?: DatabaseClient;
  claimTtlMs?: number;
}

const DEFAULT_CLAIM_TTL_MS = 30_000;

export const createSubmittedOrderMatchingQueue = (
  options: SubmittedOrderMatchingQueueOptions = {},
): SubmittedOrderMatchingQueue => {
  const db = options.db ?? createDatabaseClient();
  const claimTtlMs = options.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;

  return {
    enqueue(executor, command) {
      return enqueueSubmittedOrderMatchingCommand(executor, command);
    },
    claimNext() {
      return claimNextSubmittedOrderMatchingCommand(db, claimTtlMs);
    },
    markProcessed(input) {
      return markSubmittedOrderMatchingCommandProcessed(db, input);
    },
    markFailed(input) {
      return markSubmittedOrderMatchingCommandFailed(db, input);
    },
  };
};
