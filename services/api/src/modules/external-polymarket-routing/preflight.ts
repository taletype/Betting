import { readBooleanFlag } from "@bet/config";
import { getPolymarketBuilderCode } from "@bet/integrations";

export type PolymarketPreflightStatus = "blocked" | "ready_for_staging" | "ready_for_live";
export type PolymarketPreflightCheckStatus = "pass" | "fail" | "warning";

export interface PolymarketPreflightCheck {
  id: string;
  label: string;
  status: PolymarketPreflightCheckStatus;
  explanation: string;
  operatorHint: string;
}

const runtime = (): string => process.env.DEPLOY_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const isProductionLikeRuntime = (): boolean => ["production", "staging"].includes(runtime());
const flag = (name: string, defaultValue = false): boolean => readBooleanFlag(name, { defaultValue });

const check = (
  id: string,
  label: string,
  passed: boolean,
  explanation: string,
  operatorHint: string,
  failStatus: PolymarketPreflightCheckStatus = "fail",
): PolymarketPreflightCheck => ({ id, label, status: passed ? "pass" : failStatus, explanation, operatorHint });

export const evaluatePolymarketPreflight = () => {
  const liveTradingEnabled = flag("POLYMARKET_ROUTED_TRADING_ENABLED", false);
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER === "real" ? "real" : "disabled";
  const builderCodeConfigured = getPolymarketBuilderCode() !== null;
  const signatureVerifierImplemented = flag("POLYMARKET_USER_SIGNATURE_VERIFIER_IMPLEMENTED", false);
  const geoblockVerifierImplemented = flag("POLYMARKET_GEOBLOCK_PROOF_VERIFIER_IMPLEMENTED", false);
  const l2CredentialLookupImplemented = flag("POLYMARKET_L2_CREDENTIAL_LOOKUP_IMPLEMENTED", false);
  const auditRecordingEnabled = process.env.POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED !== "true";

  const checks: PolymarketPreflightCheck[] = [
    check("builder_code_configured", "Builder code configured", builderCodeConfigured, "Builder attribution can be attached before any user signature.", "Set POLY_BUILDER_CODE only after legal and operator review.", "warning"),
    check("feature_flag_enabled", "Routed trading feature flag", liveTradingEnabled, "Live routed trading is disabled unless the feature flag is explicitly enabled.", "Keep POLYMARKET_ROUTED_TRADING_ENABLED=false until every verifier is production-ready."),
    check("runtime_production_like", "Production or staging runtime", isProductionLikeRuntime(), "Live submission is blocked outside production-like runtimes.", "Use staging for final dry-run readiness only."),
    check("submitter_real", "Real submitter mode", submitterMode === "real", "The CLOB submitter is not in live submission mode.", "POLYMARKET_CLOB_SUBMITTER must remain disabled until readiness is approved."),
    check("submitter_health", "Submitter health check available", submitterMode === "real" && flag("POLYMARKET_SUBMITTER_HEALTH_READY", false), "Submitter health is not proven ready.", "Implement and monitor a real CLOB health check before staging."),
    check("user_auth_required", "Authenticated user required", true, "Routed order endpoints require a verified Supabase user.", "Do not accept user ids from request bodies or headers."),
    check("linked_wallet_required", "Linked wallet required", true, "Routed orders require a wallet linked through the challenge flow.", "Wallet ownership must be verified before credentials or signatures are used."),
    check("wallet_link_challenges", "Wallet-link challenge model", true, "Wallet linking uses nonce challenges and replay protection.", "Keep user:self and loose substring messages rejected."),
    check("signature_verifier", "User signature verifier", signatureVerifierImplemented, "No production user-owned Polymarket signature verifier is registered.", "Implement real order signature verification; do not add a fake verifier."),
    check("l2_credential_lookup", "User L2 credential lookup", l2CredentialLookupImplemented, "No production user-scoped L2 credential lookup is registered.", "Use only user-owned credentials; never platform credentials for user trades."),
    check("geoblock_verifier", "Server geoblock proof verifier", geoblockVerifierImplemented, "Browser geoblock status is UX-only and is not trusted for live submit.", "Implement fresh server-verifiable geoblock proof checks."),
    check("market_tradability", "Market tradability checks", true, "Market source, status, token mapping, tick size, and stale-order checks are enforced.", "Keep these checks before submitter calls."),
    check("builder_before_signature", "Builder code before signature", true, "The signed order must include the Builder code before user signature.", "Reject orders where signed builder attribution differs."),
    check("audit_recording", "Audit recording", auditRecordingEnabled, "Routed-order audit recording is expected before any live submit.", "Do not log secrets, credentials, auth headers, or full signatures."),
    check("no_internal_ledger_mutation", "No internal ledger mutation", true, "External Polymarket activity is not allowed to mutate internal trading balances.", "Reward accounting must remain separate from balances."),
  ];

  const hasFailures = checks.some((item) => item.status === "fail");
  const status: PolymarketPreflightStatus = hasFailures
    ? "blocked"
    : runtime() === "staging"
      ? "ready_for_staging"
      : "ready_for_live";

  return {
    status,
    checks,
    liveTradingEnabled,
    submitterMode,
    builderCodeConfigured,
    checkedAt: new Date().toISOString(),
  };
};
