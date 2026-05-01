import crypto from "node:crypto";

import { createDatabaseClient, type DatabaseClient, type DatabaseExecutor, type DatabaseTransaction } from "@bet/db";
import { getPolymarketBuilderCode } from "@bet/integrations";
import { incrementCounter, logger } from "@bet/observability";

import {
  accountConfirmedBuilderTradeRewards,
  recordBuilderTradeAttribution,
  type AmbassadorRewardLedgerRecord,
} from "../ambassador/repository";

export type PolymarketBuilderFeeImportStatus = "imported" | "matched" | "confirmed" | "disputed" | "void";
export type PolymarketBuilderFeeEvidenceSide = "maker" | "taker" | "unknown";

export interface PolymarketBuilderAttributionSyncResult {
  status: "skipped" | "pending_config" | "completed" | "failed";
  runId: string | null;
  source: string;
  checkedAttempts: number;
  importedCount: number;
  matchedCount: number;
  confirmedAttributions: number;
  disputedCount: number;
  voidedCount: number;
  rewardsCreated: number;
  checkedAt: string;
  message?: string;
}

export interface NormalizedBuilderFeeEvidence {
  source: string;
  externalFeeId: string | null;
  deterministicImportKey: string;
  externalOrderId: string | null;
  externalTradeId: string | null;
  clobOrderId: string | null;
  marketExternalId: string | null;
  conditionId: string | null;
  tokenId: string | null;
  traderWallet: string | null;
  builderCode: string | null;
  side: PolymarketBuilderFeeEvidenceSide;
  notionalAmountAtoms: bigint;
  feeAmountAtoms: bigint;
  feeAsset: string;
  feeBps: number | null;
  matchedAt: string | null;
  rawEvidence: Record<string, unknown>;
  initialStatus: "imported" | "disputed";
  disputeReason: string | null;
}

export interface BuilderFeeEvidenceAdapter {
  readonly source: string;
  loadEvidence(): Promise<unknown[]>;
}

interface BuilderFeeImportRow {
  id: string;
  source: string;
  external_fee_id: string | null;
  deterministic_import_key: string;
  external_order_id: string | null;
  external_trade_id: string | null;
  clob_order_id: string | null;
  market_external_id: string | null;
  condition_id: string | null;
  token_id: string | null;
  trader_wallet: string | null;
  builder_code: string | null;
  side: PolymarketBuilderFeeEvidenceSide;
  notional_amount_atoms: bigint;
  fee_amount_atoms: bigint;
  fee_asset: string;
  fee_bps: number | null;
  matched_at: Date | string | null;
  raw_evidence_json: Record<string, unknown> | string;
  status: PolymarketBuilderFeeImportStatus;
  dispute_reason: string | null;
  imported_at: Date | string;
}

interface RoutedOrderAuditCandidate {
  id: string;
  user_id: string;
  market_external_id: string;
  market_slug: string | null;
  token_id: string;
  side: "BUY" | "SELL";
  notional_usdc_atoms: bigint;
  builder_code_attached: boolean;
  builder_code: string | null;
  polymarket_order_id: string | null;
  clob_order_id: string | null;
  external_trade_id: string | null;
  trader_wallet: string | null;
  condition_id: string | null;
  referral_attribution_id: string | null;
  linked_wallet_address: string | null;
  created_at: Date | string;
}

interface ReconcileDependencies {
  db?: DatabaseClient;
  adapter?: BuilderFeeEvidenceAdapter | null;
  now?: () => Date;
  createdBy?: string | null;
}

export const polymarketBuilderAttributionSyncJobName = "polymarket_builder_attribution_sync";

const stringValue = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
};

const bigintValue = (record: Record<string, unknown>, keys: string[]): bigint | null => {
  const value = stringValue(record, keys);
  if (!value) return null;
  if (!/^-?[0-9]+$/.test(value)) return null;
  return BigInt(value);
};

const numberValue = (record: Record<string, unknown>, keys: string[]): number | null => {
  const value = stringValue(record, keys);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedAddress = (value: string | null): string | null => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
};

const normalizeSide = (value: string | null): PolymarketBuilderFeeEvidenceSide => {
  const side = value?.trim().toLowerCase();
  return side === "maker" || side === "taker" ? side : "unknown";
};

const deterministicKeyFor = (input: {
  source: string;
  externalFeeId: string | null;
  externalOrderId: string | null;
  externalTradeId: string | null;
  clobOrderId: string | null;
  builderCode: string | null;
  feeAmountAtoms: bigint | null;
  rawEvidence: Record<string, unknown>;
}): string => {
  const stable = input.externalFeeId
    ? { source: input.source, externalFeeId: input.externalFeeId }
    : {
        source: input.source,
        externalOrderId: input.externalOrderId,
        externalTradeId: input.externalTradeId,
        clobOrderId: input.clobOrderId,
        builderCode: input.builderCode,
        feeAmountAtoms: input.feeAmountAtoms?.toString() ?? null,
        rawEvidence: input.rawEvidence,
      };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
};

export const normalizeBuilderFeeEvidence = (
  source: string,
  evidence: unknown,
): NormalizedBuilderFeeEvidence => {
  const rawEvidence = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : { value: evidence };
  const externalFeeId = stringValue(rawEvidence, ["externalFeeId", "external_fee_id", "feeId", "fee_id", "id"]);
  const externalOrderId = stringValue(rawEvidence, ["externalOrderId", "external_order_id", "orderId", "order_id"]);
  const externalTradeId = stringValue(rawEvidence, ["externalTradeId", "external_trade_id", "tradeId", "trade_id", "fillId", "fill_id"]);
  const clobOrderId = stringValue(rawEvidence, ["clobOrderId", "clob_order_id", "clobOrderID", "orderID"]);
  const marketExternalId = stringValue(rawEvidence, ["marketExternalId", "market_external_id", "marketId", "market_id"]);
  const conditionId = stringValue(rawEvidence, ["conditionId", "condition_id"]);
  const tokenId = stringValue(rawEvidence, ["tokenId", "token_id", "assetId", "asset_id"]);
  const traderWallet = normalizedAddress(stringValue(rawEvidence, ["traderWallet", "trader_wallet", "wallet", "maker", "taker"]));
  const builderCode = stringValue(rawEvidence, ["builderCode", "builder_code", "builder"]);
  const side = normalizeSide(stringValue(rawEvidence, ["side", "liquiditySide", "liquidity_side"]));
  const notionalAmountAtoms = bigintValue(rawEvidence, ["notionalAmountAtoms", "notional_amount_atoms", "notionalUsdcAtoms", "notional_usdc_atoms"]) ?? 0n;
  const feeAmountAtoms = bigintValue(rawEvidence, ["feeAmountAtoms", "fee_amount_atoms", "builderFeeAtoms", "builder_fee_atoms", "feeUsdcAtoms", "fee_usdc_atoms"]) ?? 0n;
  const feeAsset = stringValue(rawEvidence, ["feeAsset", "fee_asset", "asset"]) ?? "USDC";
  const feeBps = numberValue(rawEvidence, ["feeBps", "fee_bps", "builderFeeBps", "builder_fee_bps"]);
  const matchedAt = stringValue(rawEvidence, ["matchedAt", "matched_at", "executedAt", "executed_at", "createdAt", "created_at"]);

  const disputeReasons: string[] = [];
  if (feeAmountAtoms <= 0n) disputeReasons.push("fee_amount_must_be_positive");
  if (!builderCode) disputeReasons.push("builder_code_missing");
  if (!externalOrderId && !externalTradeId && !clobOrderId) disputeReasons.push("external_order_or_trade_id_missing");
  if (!["USDC", "PUSD"].includes(feeAsset.trim().toUpperCase())) disputeReasons.push("unsupported_fee_asset");
  if (feeBps !== null && (feeBps <= 0 || feeBps > 1000)) disputeReasons.push("fee_bps_outside_expected_range");

  const deterministicImportKey = deterministicKeyFor({
    source,
    externalFeeId,
    externalOrderId,
    externalTradeId,
    clobOrderId,
    builderCode,
    feeAmountAtoms,
    rawEvidence,
  });

  return {
    source,
    externalFeeId,
    deterministicImportKey,
    externalOrderId,
    externalTradeId,
    clobOrderId,
    marketExternalId,
    conditionId,
    tokenId,
    traderWallet,
    builderCode,
    side,
    notionalAmountAtoms,
    feeAmountAtoms,
    feeAsset,
    feeBps,
    matchedAt,
    rawEvidence,
    initialStatus: disputeReasons.length > 0 ? "disputed" : "imported",
    disputeReason: disputeReasons.length > 0 ? disputeReasons.join(",") : null,
  };
};

const configuredEvidenceUrl = (): string | null => {
  const value = process.env.POLYMARKET_BUILDER_FEE_EVIDENCE_URL?.trim();
  return value || null;
};

const createConfiguredEvidenceAdapter = (): BuilderFeeEvidenceAdapter | null => {
  const url = configuredEvidenceUrl();
  if (!url) return null;
  return {
    source: process.env.POLYMARKET_BUILDER_FEE_EVIDENCE_SOURCE?.trim() || "polymarket_builder_fee_export",
    async loadEvidence() {
      const headers: Record<string, string> = { accept: "application/json" };
      const bearer = process.env.POLYMARKET_BUILDER_FEE_EVIDENCE_BEARER_TOKEN?.trim();
      if (bearer) headers.authorization = `Bearer ${bearer}`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Builder-fee evidence source returned HTTP ${response.status}`);
      const body = await response.json() as unknown;
      if (Array.isArray(body)) return body;
      if (body && typeof body === "object" && Array.isArray((body as { fees?: unknown[] }).fees)) {
        return (body as { fees: unknown[] }).fees;
      }
      if (body && typeof body === "object" && Array.isArray((body as { records?: unknown[] }).records)) {
        return (body as { records: unknown[] }).records;
      }
      throw new Error("Builder-fee evidence source did not return an array of fee records");
    },
  };
};

const insertRun = async (
  executor: DatabaseExecutor,
  input: { source: string; startedAt: string; createdBy: string | null },
): Promise<string> => {
  const [row] = await executor.query<{ id: string }>(
    `
      insert into public.polymarket_builder_fee_reconciliation_runs (source, started_at, status, created_by)
      values ($1, $2::timestamptz, 'running', $3::uuid)
      returning id
    `,
    [input.source, input.startedAt, input.createdBy],
  );
  if (!row) throw new Error("failed to create Builder-fee reconciliation run");
  return row.id;
};

const finishRun = async (
  executor: DatabaseExecutor,
  input: {
    runId: string;
    status: "succeeded" | "failed" | "partial";
    importedCount: number;
    matchedCount: number;
    confirmedCount: number;
    disputedCount: number;
    voidedCount: number;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  await executor.query(
    `
      update public.polymarket_builder_fee_reconciliation_runs
      set finished_at = now(),
          status = $2,
          imported_count = $3,
          matched_count = $4,
          confirmed_count = $5,
          disputed_count = $6,
          voided_count = $7,
          error_message = $8,
          metadata_json = $9::jsonb
      where id = $1::uuid
    `,
    [
      input.runId,
      input.status,
      input.importedCount,
      input.matchedCount,
      input.confirmedCount,
      input.disputedCount,
      input.voidedCount,
      input.errorMessage ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
};

const insertEvidence = async (
  transaction: DatabaseTransaction,
  evidence: NormalizedBuilderFeeEvidence,
): Promise<{ row: BuilderFeeImportRow; inserted: boolean }> => {
  const [inserted] = await transaction.query<BuilderFeeImportRow>(
    `
      insert into public.polymarket_builder_fee_imports (
        source,
        external_fee_id,
        deterministic_import_key,
        external_order_id,
        external_trade_id,
        clob_order_id,
        market_external_id,
        condition_id,
        token_id,
        trader_wallet,
        builder_code,
        side,
        notional_amount_atoms,
        fee_amount_atoms,
        fee_asset,
        fee_bps,
        matched_at,
        raw_evidence_json,
        status,
        dispute_reason
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17::timestamptz, $18::jsonb, $19, $20
      )
      on conflict do nothing
      returning id, source, external_fee_id, deterministic_import_key, external_order_id, external_trade_id,
        clob_order_id, market_external_id, condition_id, token_id, trader_wallet, builder_code, side,
        notional_amount_atoms, fee_amount_atoms, fee_asset, fee_bps, matched_at, raw_evidence_json,
        status, dispute_reason, imported_at
    `,
    [
      evidence.source,
      evidence.externalFeeId,
      evidence.deterministicImportKey,
      evidence.externalOrderId,
      evidence.externalTradeId,
      evidence.clobOrderId,
      evidence.marketExternalId,
      evidence.conditionId,
      evidence.tokenId,
      evidence.traderWallet,
      evidence.builderCode,
      evidence.side,
      evidence.notionalAmountAtoms,
      evidence.feeAmountAtoms,
      evidence.feeAsset,
      evidence.feeBps,
      evidence.matchedAt,
      JSON.stringify(evidence.rawEvidence),
      evidence.initialStatus,
      evidence.disputeReason,
    ],
  );
  if (inserted) return { row: inserted, inserted: true };

  const [existing] = await transaction.query<BuilderFeeImportRow>(
    `
      select id, source, external_fee_id, deterministic_import_key, external_order_id, external_trade_id,
        clob_order_id, market_external_id, condition_id, token_id, trader_wallet, builder_code, side,
        notional_amount_atoms, fee_amount_atoms, fee_asset, fee_bps, matched_at, raw_evidence_json,
        status, dispute_reason, imported_at
      from public.polymarket_builder_fee_imports
      where deterministic_import_key = $1
         or (source = $2 and external_fee_id is not null and external_fee_id = $3)
         or (
           $4::text is not null
           and source = $2
           and external_trade_id = $4
           and builder_code = $5
           and fee_amount_atoms = $6
         )
      order by imported_at asc
      limit 1
    `,
    [
      evidence.deterministicImportKey,
      evidence.source,
      evidence.externalFeeId,
      evidence.externalTradeId,
      evidence.builderCode,
      evidence.feeAmountAtoms,
    ],
  );
  if (!existing) throw new Error("failed to read existing Builder-fee import");
  return { row: existing, inserted: false };
};

const markImport = async (
  executor: DatabaseExecutor,
  input: { importId: string; status: PolymarketBuilderFeeImportStatus; disputeReason?: string | null },
): Promise<void> => {
  await executor.query(
    `
      update public.polymarket_builder_fee_imports
      set status = $2,
          dispute_reason = $3,
          matched_at = case when $2 in ('matched', 'confirmed') then coalesce(matched_at, now()) else matched_at end
      where id = $1::uuid
    `,
    [input.importId, input.status, input.disputeReason ?? null],
  );
};

const loadCandidates = async (
  executor: DatabaseExecutor,
  fee: BuilderFeeImportRow,
): Promise<RoutedOrderAuditCandidate[]> => {
  return executor.query<RoutedOrderAuditCandidate>(
    `
      select
        audit.id,
        audit.user_id,
        audit.market_external_id,
        audit.market_slug,
        audit.token_id,
        audit.side,
        audit.notional_usdc_atoms,
        audit.builder_code_attached,
        audit.builder_code,
        audit.polymarket_order_id,
        audit.clob_order_id,
        audit.external_trade_id,
        audit.trader_wallet,
        audit.condition_id,
        audit.referral_attribution_id,
        linked.wallet_address as linked_wallet_address,
        audit.created_at
      from public.polymarket_routed_order_audits audit
      left join public.linked_wallets linked
        on linked.user_id = audit.user_id
       and linked.chain = 'base'
      where audit.builder_code_attached = true
        and (
          ($1::text is not null and audit.polymarket_order_id = $1)
          or ($2::text is not null and audit.clob_order_id = $2)
          or ($3::text is not null and audit.external_trade_id = $3)
          or (
            $4::text is not null
            and $5::text is not null
            and audit.market_external_id = $4
            and audit.token_id = $5
          )
          or (
            $6::text is not null
            and $5::text is not null
            and audit.condition_id = $6
            and audit.token_id = $5
          )
        )
      order by
        case
          when $3::text is not null and audit.external_trade_id = $3 then 0
          when $2::text is not null and audit.clob_order_id = $2 then 1
          when $1::text is not null and audit.polymarket_order_id = $1 then 2
          else 3
        end,
        audit.created_at desc
      limit 10
    `,
    [
      fee.external_order_id,
      fee.clob_order_id,
      fee.external_trade_id,
      fee.market_external_id,
      fee.token_id,
      fee.condition_id,
    ],
  );
};

const notionalWithinTolerance = (expected: bigint, actual: bigint): boolean => {
  if (expected <= 0n || actual <= 0n) return true;
  const diff = expected > actual ? expected - actual : actual - expected;
  const tolerance = actual / 50n > 10_000n ? actual / 50n : 10_000n;
  return diff <= tolerance;
};

const sameText = (a: string | null, b: string | null): boolean =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

const evaluateCandidate = (
  fee: BuilderFeeImportRow,
  candidate: RoutedOrderAuditCandidate,
  configuredBuilderCode: string | null,
): { confirm: boolean; reason?: string } => {
  if (fee.fee_amount_atoms <= 0n) return { confirm: false, reason: "fee_amount_must_be_positive" };
  if (!fee.builder_code) return { confirm: false, reason: "builder_code_missing" };
  if (configuredBuilderCode && !sameText(fee.builder_code, configuredBuilderCode)) {
    return { confirm: false, reason: "builder_code_mismatches_configured_builder" };
  }
  if (candidate.builder_code && !sameText(fee.builder_code, candidate.builder_code)) {
    return { confirm: false, reason: "builder_code_mismatches_routed_audit" };
  }

  const evidenceWallet = normalizedAddress(fee.trader_wallet);
  const auditWallet = normalizedAddress(candidate.trader_wallet) ?? normalizedAddress(candidate.linked_wallet_address);
  if (!evidenceWallet) return { confirm: false, reason: "trader_wallet_missing_from_evidence" };
  if (!auditWallet) return { confirm: false, reason: "routed_audit_wallet_missing" };
  if (evidenceWallet !== auditWallet) return { confirm: false, reason: "trader_wallet_mismatch" };

  if (fee.token_id && !sameText(fee.token_id, candidate.token_id)) return { confirm: false, reason: "token_id_mismatch" };
  if (fee.market_external_id && !sameText(fee.market_external_id, candidate.market_external_id)) {
    return { confirm: false, reason: "market_external_id_mismatch" };
  }
  if (fee.condition_id && candidate.condition_id && !sameText(fee.condition_id, candidate.condition_id)) {
    return { confirm: false, reason: "condition_id_mismatch" };
  }
  if (!notionalWithinTolerance(fee.notional_amount_atoms, candidate.notional_usdc_atoms)) {
    return { confirm: false, reason: "notional_amount_outside_tolerance" };
  }
  if (fee.fee_bps !== null && (fee.fee_bps <= 0 || fee.fee_bps > 1000)) {
    return { confirm: false, reason: "fee_bps_outside_expected_range" };
  }
  if (fee.matched_at) {
    const matchedAt = new Date(fee.matched_at).getTime();
    const routedAt = new Date(candidate.created_at).getTime();
    if (Number.isFinite(matchedAt) && Number.isFinite(routedAt) && matchedAt + 5 * 60_000 < routedAt) {
      return { confirm: false, reason: "fee_matched_before_routed_attempt" };
    }
  }
  return { confirm: true };
};

const reconcileEvidence = async (
  transaction: DatabaseTransaction,
  fee: BuilderFeeImportRow,
  configuredBuilderCode: string | null,
): Promise<{ checkedAttempts: number; matched: boolean; confirmed: boolean; disputed: boolean; rewards: AmbassadorRewardLedgerRecord[] }> => {
  if (fee.status === "confirmed") {
    return { checkedAttempts: 0, matched: false, confirmed: false, disputed: false, rewards: [] };
  }
  if (fee.status === "disputed" || fee.status === "void") {
    return { checkedAttempts: 0, matched: false, confirmed: false, disputed: false, rewards: [] };
  }

  const candidates = await loadCandidates(transaction, fee);
  if (candidates.length === 0) {
    return { checkedAttempts: 0, matched: false, confirmed: false, disputed: false, rewards: [] };
  }

  for (const candidate of candidates) {
    const decision = evaluateCandidate(fee, candidate, configuredBuilderCode);
    if (!decision.confirm) {
      await markImport(transaction, { importId: fee.id, status: "disputed", disputeReason: decision.reason });
      incrementCounter("builder_fee_evidence_disputed", { reason: decision.reason ?? "unknown" });
      return { checkedAttempts: candidates.length, matched: true, confirmed: false, disputed: true, rewards: [] };
    }

    await markImport(transaction, { importId: fee.id, status: "matched" });
    incrementCounter("builder_fee_evidence_matched", { source: fee.source });
    const attribution = await recordBuilderTradeAttribution(transaction, {
      userId: candidate.user_id,
      polymarketOrderId: fee.clob_order_id ?? fee.external_order_id ?? candidate.polymarket_order_id,
      polymarketTradeId: fee.external_trade_id ?? candidate.external_trade_id,
      marketSlug: candidate.market_slug,
      conditionId: fee.condition_id ?? candidate.condition_id,
      notionalUsdcAtoms: fee.notional_amount_atoms > 0n ? fee.notional_amount_atoms : candidate.notional_usdc_atoms,
      builderFeeUsdcAtoms: fee.fee_amount_atoms,
      status: "confirmed",
      rawJson: {
        source: "polymarket_builder_fee_reconciliation",
        builderFeeImportId: fee.id,
        deterministicImportKey: fee.deterministic_import_key,
        routedOrderAuditId: candidate.id,
        feeAsset: fee.fee_asset,
      },
      sourceBuilderFeeImportId: fee.id,
      sourceEvidenceKey: fee.deterministic_import_key,
    });
    await markImport(transaction, { importId: fee.id, status: "confirmed" });
    incrementCounter("builder_fee_evidence_confirmed", { source: fee.source });
    const rewards = await accountConfirmedBuilderTradeRewards(transaction, { tradeAttributionId: attribution.id });
    if (rewards.length > 0) {
      incrementCounter("reward_ledger_created_from_confirmed_fee", { source: fee.source });
    }
    return { checkedAttempts: candidates.length, matched: true, confirmed: true, disputed: false, rewards };
  }

  return { checkedAttempts: candidates.length, matched: false, confirmed: false, disputed: false, rewards: [] };
};

export const runPolymarketBuilderAttributionSyncWithDependencies = async (
  dependencies: ReconcileDependencies = {},
): Promise<PolymarketBuilderAttributionSyncResult> => {
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (process.env.POLYMARKET_BUILDER_ATTRIBUTION_SYNC_ENABLED !== "true") {
    return {
      status: "skipped",
      runId: null,
      source: "disabled",
      checkedAttempts: 0,
      importedCount: 0,
      matchedCount: 0,
      confirmedAttributions: 0,
      disputedCount: 0,
      voidedCount: 0,
      rewardsCreated: 0,
      checkedAt,
    };
  }

  const adapter = dependencies.adapter === undefined ? createConfiguredEvidenceAdapter() : dependencies.adapter;
  const source = adapter?.source ?? "unconfigured";
  const db = dependencies.db ?? createDatabaseClient();
  const runId = await insertRun(db, { source, startedAt: checkedAt, createdBy: dependencies.createdBy ?? null });

  if (!adapter) {
    const message = "POLYMARKET_BUILDER_FEE_EVIDENCE_URL is not configured; no Builder-fee rewards were created.";
    await finishRun(db, {
      runId,
      status: "succeeded",
      importedCount: 0,
      matchedCount: 0,
      confirmedCount: 0,
      disputedCount: 0,
      voidedCount: 0,
      metadata: { pendingConfig: true, message },
    });
    logger.info("polymarket_builder_fee_reconciliation.pending_config", { runId, source });
    return {
      status: "pending_config",
      runId,
      source,
      checkedAttempts: 0,
      importedCount: 0,
      matchedCount: 0,
      confirmedAttributions: 0,
      disputedCount: 0,
      voidedCount: 0,
      rewardsCreated: 0,
      checkedAt,
      message,
    };
  }

  try {
    incrementCounter("builder_fee_import_started", { source });
    const configuredBuilderCode = getPolymarketBuilderCode();
    const rawEvidence = await adapter.loadEvidence();
    const normalized = rawEvidence.map((item) => normalizeBuilderFeeEvidence(source, item));

    const result = await db.transaction(async (transaction) => {
      let importedCount = 0;
      let checkedAttempts = 0;
      let matchedCount = 0;
      let confirmedCount = 0;
      let disputedCount = 0;
      let rewardsCreated = 0;

      for (const evidence of normalized) {
        const { row, inserted } = await insertEvidence(transaction, evidence);
        if (inserted) {
          importedCount += 1;
          incrementCounter("builder_fee_evidence_imported", { source, status: evidence.initialStatus });
        }
        if (row.status === "disputed") {
          disputedCount += inserted ? 1 : 0;
          continue;
        }
        const reconciled = await reconcileEvidence(transaction, row, configuredBuilderCode);
        checkedAttempts += reconciled.checkedAttempts;
        if (reconciled.matched) matchedCount += 1;
        if (reconciled.confirmed) confirmedCount += 1;
        if (reconciled.disputed) disputedCount += 1;
        rewardsCreated += reconciled.rewards.length;
      }

      return { importedCount, checkedAttempts, matchedCount, confirmedCount, disputedCount, rewardsCreated };
    });

    await finishRun(db, {
      runId,
      status: "succeeded",
      importedCount: result.importedCount,
      matchedCount: result.matchedCount,
      confirmedCount: result.confirmedCount,
      disputedCount: result.disputedCount,
      voidedCount: 0,
      metadata: { rawEvidenceCount: rawEvidence.length },
    });
    incrementCounter("builder_fee_import_completed", { source, status: "succeeded" });
    return {
      status: "completed",
      runId,
      source,
      checkedAttempts: result.checkedAttempts,
      importedCount: result.importedCount,
      matchedCount: result.matchedCount,
      confirmedAttributions: result.confirmedCount,
      disputedCount: result.disputedCount,
      voidedCount: 0,
      rewardsCreated: result.rewardsCreated,
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Builder-fee reconciliation failed";
    await finishRun(db, {
      runId,
      status: "failed",
      importedCount: 0,
      matchedCount: 0,
      confirmedCount: 0,
      disputedCount: 0,
      voidedCount: 0,
      errorMessage: message,
    });
    incrementCounter("builder_fee_import_completed", { source, status: "failed" });
    logger.error("polymarket_builder_fee_reconciliation.failed", { runId, source, error: message });
    return {
      status: "failed",
      runId,
      source,
      checkedAttempts: 0,
      importedCount: 0,
      matchedCount: 0,
      confirmedAttributions: 0,
      disputedCount: 0,
      voidedCount: 0,
      rewardsCreated: 0,
      checkedAt,
      message,
    };
  }
};

export const runPolymarketBuilderAttributionSync = async (): Promise<PolymarketBuilderAttributionSyncResult> =>
  runPolymarketBuilderAttributionSyncWithDependencies();
