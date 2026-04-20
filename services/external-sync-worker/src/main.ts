import { incrementCounter, logger } from "@bet/observability";

import { runMarketSyncJob } from "./jobs/market-sync";

export const main = async (): Promise<void> => {
  try {
    await runMarketSyncJob();
    console.log("external sync worker: market sync completed");
  } catch (error) {
    incrementCounter("worker_loop_failures_total", {
      worker: "external-sync-worker",
    });
    logger.error("external-sync-worker.run_failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
