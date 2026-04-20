import { runMarketSyncJob } from "./market-sync";

export const runDiscoveryJob = async (): Promise<void> => {
  await runMarketSyncJob();
};
