import { runMarketSyncJob } from "./jobs/market-sync";

export const main = async (): Promise<void> => {
  await runMarketSyncJob();
  console.log("external sync worker: market sync completed");
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
