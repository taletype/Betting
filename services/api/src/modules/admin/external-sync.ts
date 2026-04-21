import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExternalSyncRunResult {
  ok: true;
  triggeredAt: string;
  command: string;
}

export const runExternalSync = async (): Promise<ExternalSyncRunResult> => {
  await execFileAsync("pnpm", ["sync:external"], {
    cwd: process.cwd(),
    env: process.env,
  });

  return {
    ok: true,
    triggeredAt: new Date().toISOString(),
    command: "pnpm sync:external",
  };
};
