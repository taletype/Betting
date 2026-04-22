import {
  runMarketSyncJob,
  type ExternalSyncRunSummary,
} from "../../../../external-sync-worker/src/index";

export interface ExternalSyncRunResult {
  ok: true;
  triggeredAt: string;
  mode: "in_process";
  summary: ExternalSyncRunSummary;
}

export const runExternalSync = async (source?: string): Promise<ExternalSyncRunResult> => {
  const summary = await runMarketSyncJob(source);

  return {
    ok: true,
    triggeredAt: new Date().toISOString(),
    mode: "in_process",
    summary,
  };
};
