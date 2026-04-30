import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { evaluatePolymarketPreflight } from "../modules/external-polymarket-routing/preflight";

type GateStatus = "pass" | "fail";

interface Gate {
  id: string;
  status: GateStatus;
  message: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".sql", ".env", ".example", ".yml", ".yaml"]);
const ignoredPath = /(^|\/)(\.git|node_modules|\.next|dist|coverage|\.turbo)(\/|$)|pnpm-lock\.yaml$|tsconfig\.tsbuildinfo$/;

const hasValidBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

const boolEnv = (name: string): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true" || value === "1";
};

const gate = (id: string, passed: boolean, message: string): Gate => ({
  id,
  status: passed ? "pass" : "fail",
  message,
});

const walkTextFiles = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir) || ignoredPath.test(dir)) return out;

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (ignoredPath.test(path)) continue;
    const stats = statSync(path);

    if (stats.isDirectory()) {
      walkTextFiles(path, out);
      continue;
    }

    const extension = entry.includes(".env") ? ".env" : entry.slice(entry.lastIndexOf("."));
    if (textExtensions.has(extension)) out.push(path);
  }

  return out;
};

const readSources = (paths: string[]): string =>
  paths
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

const fileContains = (path: string, pattern: RegExp): boolean =>
  existsSync(path) && pattern.test(readFileSync(path, "utf8"));

const envKeysMatching = (pattern: RegExp): string[] =>
  Object.keys(process.env).filter((key) => pattern.test(key));

const publicPolymarketSecretEnvKeys = envKeysMatching(
  /^NEXT_PUBLIC_.*(?:POLY|CLOB|SECRET|PRIVATE|PASSPHRASE)/i,
);

const allTextFiles = walkTextFiles(repoRoot);
const allSource = readSources(allTextFiles);
const autoPayoutEnabledAssignment = /^[ \t#]*AMBASSADOR_AUTO_PAYOUT_ENABLED\s*=\s*true\b/im;
const routingSource = readSources([
  resolve(repoRoot, "services/api/src/modules/external-polymarket-routing/handlers.ts"),
  resolve(repoRoot, "services/api/src/modules/external-polymarket-routing/submitter.ts"),
]);
const payoutSource = readSources([
  resolve(repoRoot, "services/api/src/modules/ambassador/repository.ts"),
  resolve(repoRoot, "apps/web/src/app/api/_shared/ambassador.ts"),
]);

const preflight = evaluatePolymarketPreflight();

const gates: Gate[] = [
  gate("builder_code_server_side", hasValidBuilderCode(), "POLY_BUILDER_CODE must be configured as a server-side bytes32 value."),
  gate("public_flag_intentional", boolEnv("POLYMARKET_ROUTED_TRADING_ENABLED"), "POLYMARKET_ROUTED_TRADING_ENABLED must be true for public routed trading."),
  gate("beta_flag_off_for_public", !boolEnv("POLYMARKET_ROUTED_TRADING_BETA_ENABLED"), "Public mode does not require the beta allowlist flag; keep POLYMARKET_ROUTED_TRADING_BETA_ENABLED=false."),
  gate("submitter_real", process.env.POLYMARKET_CLOB_SUBMITTER === "real", "POLYMARKET_CLOB_SUBMITTER must be real and not disabled."),
  gate("runtime_production_like", ["production", "staging"].includes(process.env.DEPLOY_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? ""), "Runtime must be production-like."),
  gate("submitter_health_ready", boolEnv("POLYMARKET_SUBMITTER_HEALTH_READY"), "Submitter health must be explicitly ready."),
  gate("signature_verifier_ready", boolEnv("POLYMARKET_USER_SIGNATURE_VERIFIER_IMPLEMENTED"), "Production user-owned order signature verification must be implemented."),
  gate("l2_lookup_ready", boolEnv("POLYMARKET_L2_CREDENTIAL_LOOKUP_IMPLEMENTED"), "User-owned Polymarket/L2 credential lookup must be implemented."),
  gate("geoblock_verifier_ready", boolEnv("POLYMARKET_GEOBLOCK_PROOF_VERIFIER_IMPLEMENTED"), "Server geoblock proof verification must be implemented."),
  gate("audit_recording_enabled", process.env.POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED !== "true", "Routed-order audit recording must remain enabled."),
  gate("no_next_public_polymarket_secrets", publicPolymarketSecretEnvKeys.length === 0, "No NEXT_PUBLIC env var may expose Polymarket/CLOB secrets, private keys, or passphrases."),
  gate("submitter_no_platform_secret_env", !/process\.env\.POLYMARKET_(API_KEY|API_SECRET|API_PASSPHRASE|CLOB_API_KEY|CLOB_SECRET|CLOB_PASSPHRASE)/.test(routingSource), "Submitter must not read platform-owned Polymarket trading credentials."),
  gate("server_never_signs_user_orders", fileContains(resolve(repoRoot, "services/api/src/modules/external-polymarket-routing/submitter.ts"), /server-side routed submitter must not sign user orders/), "Submitter signer must be address-only and unable to sign user orders."),
  gate("wallet_required", /linked wallet is required|POLYMARKET_WALLET_NOT_CONNECTED/.test(routingSource), "Submit path must require a linked user wallet."),
  gate("l2_credentials_required", /Polymarket credentials required|POLYMARKET_CREDENTIALS_MISSING/.test(routingSource), "Submit path must require user-owned Polymarket/L2 credentials."),
  gate("signed_order_required", /readSignedOrder\(input\.signedOrder\)|signedOrder\.signature|POLYMARKET_USER_SIGNING_UNVERIFIED/.test(routingSource), "Submit path must require and verify a user-signed order."),
  gate("builder_signed_before_submit", /builderCode must be present before user signing/.test(routingSource) && /payload\.orderInput\.builderCode !== payload\.signedOrder\.builder/.test(routingSource), "Builder Code must match the signed order before real submit."),
  gate("market_tradable_required", /assertMarketTradable/.test(routingSource) && /market is not open for Polymarket trading/.test(routingSource), "Submit path must require a tradable/open market."),
  gate("failed_readiness_blocks_submit", /POLYMARKET_ROUTED_TRADING_DISABLED/.test(routingSource) && /POLYMARKET_SUBMITTER_UNAVAILABLE/.test(routingSource), "Failed readiness must block submit with explicit disabled reasons."),
  gate("no_internal_ledger_mutation", !/@bet\/ledger|@bet\/trading|ledger_journals|ledger_entries|balanceDeltas|rpc_place_order|insert\s+into\s+public\.ledger|update\s+public\.portfolio|mutateBalance|creditBalance|debitBalance/i.test(routingSource), "Polymarket submit path must not mutate internal ledgers or balances."),
  gate("auto_payout_disabled", !boolEnv("AMBASSADOR_AUTO_PAYOUT_ENABLED") && !autoPayoutEnabledAssignment.test(allSource), "Automatic payout must remain disabled."),
  gate("payout_manual_admin_approved", /payout requires admin approval before it can be marked paid/.test(payoutSource), "Payouts must remain manual/admin-approved."),
  gate("admin_preflight_ready", preflight.status === "ready_for_live", "Admin Polymarket preflight must report ready_for_live."),
];

const failed = gates.filter((item) => item.status === "fail");

for (const item of gates) {
  const marker = item.status === "pass" ? "PASS" : "FAIL";
  console.log(`${marker} ${item.id}: ${item.message}`);
}

console.log(`\npreflight_status=${preflight.status}`);
console.log(`live_trading_enabled=${preflight.liveTradingEnabled}`);
console.log(`submitter_mode=${preflight.submitterMode}`);
console.log(`builder_code_configured=${preflight.builderCodeConfigured}`);

if (publicPolymarketSecretEnvKeys.length > 0) {
  console.log(`blocked_next_public_secret_keys=${publicPolymarketSecretEnvKeys.join(",")}`);
}

if (failed.length > 0) {
  console.error(`\nPublic Polymarket routed live trading is NOT safe to enable. Blockers: ${failed.map((item) => item.id).join(", ")}`);
  process.exitCode = 1;
}
