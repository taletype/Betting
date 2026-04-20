import { runMarketSyncJob } from "./market-sync";

export const runTradeSyncJob = async (): Promise<void> => {
  await runMarketSyncJob();
};
