import { logger } from "@bet/observability";

import { runMatchJob } from "./engine/match";

export const main = async (): Promise<void> => {
  logger.info("matching-worker.started");
  await runMatchJob({ marketId: "00000000-0000-4000-8000-000000000000" });
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
