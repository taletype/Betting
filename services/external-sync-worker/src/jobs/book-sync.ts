import { runMarketSyncJob } from "./market-sync";

export const runBookSyncJob = async (): Promise<void> => {
  await runMarketSyncJob("polymarket");
};
