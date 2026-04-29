import { closeDatabasePool } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";

import { runMarketSyncJob } from "./jobs/market-sync";

export const main = async (): Promise<void> => {
  const source = process.env.EXTERNAL_SYNC_SOURCE?.trim() || undefined;
  logger.info("external-sync-worker.starting", { source: source ?? "all" });

  try {
    const summary = await runMarketSyncJob(source);
    console.log("external sync worker: market sync completed", JSON.stringify(summary));
  } catch (error) {
    incrementCounter("worker_loop_failures_total", {
      worker: "external-sync-worker",
    });
    logger.error("external-sync-worker.run_failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  } finally {
    await closeDatabasePool();
  }
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
