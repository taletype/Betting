import { logger } from "@bet/observability";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const processSettlementTick = async (): Promise<void> => {
  logger.info("settlement tick started", {
    at: new Date().toISOString(),
  });

  // TODO: wire concrete settlement jobs.

  logger.info("settlement tick completed", {
    at: new Date().toISOString(),
  });
};

export const main = async (): Promise<void> => {
  const intervalMs = Number(process.env.SETTLEMENT_INTERVAL_MS ?? 10_000);

  while (true) {
    try {
      await processSettlementTick();
    } catch (error) {
      logger.error("settlement tick failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }

    await sleep(intervalMs);
  }
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
