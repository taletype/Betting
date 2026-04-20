import { logger } from "@bet/observability";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const syncOnce = async (): Promise<void> => {
  logger.info("external sync tick started", {
    at: new Date().toISOString(),
  });

  // TODO: wire concrete source sync jobs.

  logger.info("external sync tick completed", {
    at: new Date().toISOString(),
  });
};

export const main = async (): Promise<void> => {
  const intervalMs = Number(process.env.EXTERNAL_SYNC_INTERVAL_MS ?? 10_000);

  while (true) {
    try {
      await syncOnce();
    } catch (error) {
      logger.error("external sync tick failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }

    await sleep(intervalMs);
  }
import { runMarketSyncJob } from "./jobs/market-sync";

export const main = async (): Promise<void> => {
  await runMarketSyncJob();
  console.log("external sync worker: market sync completed");
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
