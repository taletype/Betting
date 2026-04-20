import { runMarketSyncJob } from "./market-sync";

export const runResolutionSyncJob = async (): Promise<void> => {
  await runMarketSyncJob();
};
