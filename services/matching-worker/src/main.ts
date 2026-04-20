import { logger } from "@bet/observability";
import { processNextSubmittedOrderMatchingJob } from "@bet/trading";

const POLL_INTERVAL_MS = Number(process.env.MATCHING_WORKER_POLL_INTERVAL_MS ?? 1000);

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

export const main = async (): Promise<void> => {
  logger.info("matching-worker.started", { pollIntervalMs: POLL_INTERVAL_MS });

  while (true) {
    try {
      const result = await processNextSubmittedOrderMatchingJob();

      if (!result) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
    } catch (error) {
      logger.error("matching-worker.loop_failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
      await sleep(POLL_INTERVAL_MS);
    }
  }
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
