import { createBaseChainMonitor } from "@bet/chain";
import { readPositiveInteger } from "@bet/config";
import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger, recordGauge } from "@bet/observability";

import { runBaseTreasuryReconciliation, type ReconciliationFailure } from "./baseTreasuryReconciliation";

const db = createDatabaseClient();

const runLedgerBalanceCheck = async (): Promise<ReconciliationFailure[]> => {
  const rows = await db.query<{ journal_id: string }>(
    `
      select le.journal_id
      from public.ledger_entries le
      group by le.journal_id, le.currency
      having
        sum(case when le.direction = 'debit' then le.amount else 0 end)
        <> sum(case when le.direction = 'credit' then le.amount else 0 end)
    `,
  );

  return rows.map((row) => ({
    check: "ledger_balance_consistency",
    details: `unbalanced ledger journal ${row.journal_id}`,
  }));
};

const runReserveExposureCheck = async (): Promise<ReconciliationFailure[]> => {
  const rows = await db.query<{ order_id: string; reserved_amount: bigint; expected_reserved_amount: bigint }>(
    `
      select
        o.id as order_id,
        o.reserved_amount,
        (o.price * o.remaining_quantity) as expected_reserved_amount
      from public.orders o
      where o.status in ('open', 'partially_filled')
        and o.reserved_amount <> (o.price * o.remaining_quantity)
    `,
  );

  return rows.map((row) => ({
    check: "reserve_vs_open_order_exposure",
    details: `order ${row.order_id} reserved=${row.reserved_amount} expected=${row.expected_reserved_amount}`,
  }));
};

const runPositionTradeCheck = async (): Promise<ReconciliationFailure[]> => {
  const rows = await db.query<{
    user_id: string;
    market_id: string;
    outcome_id: string;
    net_quantity: bigint;
    expected_net_quantity: bigint;
  }>(
    `
      with trade_net as (
        select
          t.maker_user_id as user_id,
          t.market_id,
          t.outcome_id,
          sum(
            case
              when mo.side = 'buy' then t.quantity
              else -t.quantity
            end
          ) as quantity_delta
        from public.trades t
        join public.orders mo on mo.id = t.maker_order_id
        group by t.maker_user_id, t.market_id, t.outcome_id

        union all

        select
          t.taker_user_id as user_id,
          t.market_id,
          t.outcome_id,
          sum(
            case
              when to2.side = 'buy' then t.quantity
              else -t.quantity
            end
          ) as quantity_delta
        from public.trades t
        join public.orders to2 on to2.id = t.taker_order_id
        group by t.taker_user_id, t.market_id, t.outcome_id
      ),
      expected as (
        select
          user_id,
          market_id,
          outcome_id,
          sum(quantity_delta) as expected_net_quantity
        from trade_net
        group by user_id, market_id, outcome_id
      )
      select
        p.user_id,
        p.market_id,
        p.outcome_id,
        p.net_quantity,
        coalesce(e.expected_net_quantity, 0) as expected_net_quantity
      from public.positions p
      left join expected e
        on e.user_id = p.user_id
       and e.market_id = p.market_id
       and e.outcome_id = p.outcome_id
      where p.net_quantity <> coalesce(e.expected_net_quantity, 0)
    `,
  );

  return rows.map((row) => ({
    check: "position_trade_consistency",
    details: `position ${row.user_id}/${row.market_id}/${row.outcome_id} net=${row.net_quantity} expected=${row.expected_net_quantity}`,
  }));
};

export const main = async (): Promise<void> => {
  const baseReport = await runBaseTreasuryReconciliation({
    db,
    chainMonitor: createBaseChainMonitor(),
    minConfirmations: readPositiveInteger("BASE_RECON_MIN_CONFIRMATIONS", { defaultInLocal: 12 }),
  });

  const failures = [
    ...(await runLedgerBalanceCheck()),
    ...(await runReserveExposureCheck()),
    ...(await runPositionTradeCheck()),
    ...baseReport.failures,
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    checks: {
      ledger: 3,
      baseTreasury: {
        depositsChecked: baseReport.counts.depositsChecked,
        withdrawalsChecked: baseReport.counts.withdrawalsChecked,
      },
    },
    treasury: baseReport.treasurySummary,
    failures,
  };

  const reportJson = JSON.stringify(report, null, 2);
  console.log(reportJson);

  logger.info("reconciliation report generated", {
    event: "reconciliation.report",
    mismatchCount: failures.length,
    depositsChecked: baseReport.counts.depositsChecked,
    withdrawalsChecked: baseReport.counts.withdrawalsChecked,
    treasuryInflowAmount: baseReport.treasurySummary.inflowAmount.toString(),
    treasuryOutflowAmount: baseReport.treasurySummary.outflowAmount.toString(),
  });
  recordGauge("reconciliation_drift_count", failures.length, {
    service: "reconciliation-worker",
  });

  if (failures.length === 0) {
    incrementCounter("reconciliation_pass_total", {
      service: "reconciliation-worker",
    });
    console.log(
      `reconciliation summary: ok (deposits=${baseReport.counts.depositsChecked}, withdrawals=${baseReport.counts.withdrawalsChecked})`,
    );
    return;
  }

  logger.error("reconciliation checks failed", {
    event: "reconciliation.mismatch",
    count: failures.length,
    failures,
    checkedAt: new Date().toISOString(),
  });
  incrementCounter("reconciliation_fail_total", {
    service: "reconciliation-worker",
  });

  console.error(`reconciliation summary: FAILED mismatches=${failures.length}`);
  process.exitCode = 1;
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
