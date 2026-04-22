import { getPortfolio, listMarkets, requestWithdrawal, verifyDepositTx } from "../../lib/api";
import { baseNetworkLabel, baseSettlementAsset, baseTreasuryAddress, baseUsdcAddress, formatBaseExplorerTxUrl } from "../../lib/base-network";
import { formatPrice, formatQuantity, formatUsdc } from "../../lib/format";
import { formatDateTime, getLocaleCopy, interpolate, type AppLocale } from "../../lib/locale";
import { WalletConnectCard } from "./wallet-connect-card";

const withdrawalTone = (status: "requested" | "completed" | "failed"): "warning" | "success" | "danger" => {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
};

const depositTone = (status: string): "success" | "warning" | "danger" | "neutral" => {
  if (status === "confirmed" || status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "pending" || status === "submitted") {
    return "warning";
  }

  return "neutral";
};

const orderStatusTone = (status: string): "success" | "warning" | "neutral" => {
  if (status === "open") {
    return "success";
  }

  if (status === "partially_filled") {
    return "warning";
  }

  return "neutral";
};

export async function renderPortfolioPage(locale: AppLocale) {
  const copy = getLocaleCopy(locale).portfolio;
  const [portfolioResult, marketsResult] = await Promise.allSettled([getPortfolio(), listMarkets()]);
  const portfolioUnavailable = portfolioResult.status === "rejected";
  const portfolio =
    portfolioResult.status === "fulfilled"
      ? portfolioResult.value
      : ({
          balances: [],
          linkedWallet: null,
          positions: [],
          openOrders: [],
          claims: [],
          deposits: [],
          withdrawals: [],
        } as Awaited<ReturnType<typeof getPortfolio>>);
  const markets = marketsResult.status === "fulfilled" ? marketsResult.value : [];
  const primaryBalance = portfolio.balances[0];

  const marketById = new Map(markets.map((market) => [market.id, market]));
  const getMarketTitle = (marketId: string): string => marketById.get(marketId)?.title ?? `${marketId.slice(0, 8)}…`;
  const getOutcomeTitle = (marketId: string, outcomeId: string): string =>
    marketById.get(marketId)?.outcomes.find((outcome: { id: string; title: string }) => outcome.id === outcomeId)?.title ?? `${outcomeId.slice(0, 8)}…`;

  const verifyDepositAction = async (formData: FormData) => {
    "use server";
    await verifyDepositTx(String(formData.get("txHash") ?? ""));
  };

  const requestWithdrawalAction = async (formData: FormData) => {
    "use server";
    await requestWithdrawal({
      amountAtoms: BigInt(String(formData.get("amountAtoms") ?? "0")),
      destinationAddress: String(formData.get("destinationAddress") ?? ""),
    });
  };

  const orderStatusLabel = (status: string): string =>
    copy.orderStatuses[status] ?? status.charAt(0).toUpperCase() + status.slice(1);

  const claimStatusLabel = (status: string): string => copy.claimStatuses[status] ?? status;
  const withdrawalStatusLabel = (status: "requested" | "completed" | "failed"): string => copy.withdrawalStatuses[status];
  const depositStatusLabel = (status: string): string => copy.depositStatuses[status] ?? status;
  const sideLabel = (side: string): string => copy.sides[side] ?? side;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </section>

      {portfolioUnavailable ? (
        <section className="panel empty-state">{copy.unavailable}</section>
      ) : null}

      <section className="grid">
        <div className="panel stack">
          <strong>{copy.availableBalance}</strong>
          <div className="metric">{primaryBalance ? formatUsdc(primaryBalance.available, locale) : formatUsdc(0n, locale)}</div>
          <div className="muted">{primaryBalance?.currency ?? "USDC"} {copy.availableBalanceHint}</div>
        </div>
        <div className="panel stack">
          <strong>{copy.reservedBalance}</strong>
          <div className="metric">{primaryBalance ? formatUsdc(primaryBalance.reserved, locale) : formatUsdc(0n, locale)}</div>
          <div className="muted">{copy.reservedBalanceHint}</div>
        </div>
      </section>

      <WalletConnectCard linkedWalletAddress={portfolio.linkedWallet?.walletAddress} locale={locale} />

      {portfolio.linkedWallet ? (
        <section className="panel stack">
          <h2 className="section-title">{copy.linkedWalletRecord}</h2>
          <div className="badge badge-neutral">{baseNetworkLabel}</div>
          <div className="kv">
            <span className="kv-key">{copy.walletAddress}</span>
            <span className="kv-value">{portfolio.linkedWallet.walletAddress}</span>
          </div>
          <div className="muted">{copy.verifiedAt} {formatDateTime(locale, portfolio.linkedWallet.verifiedAt)}</div>
        </section>
      ) : null}

      <section className="panel stack">
        <h2 className="section-title">{copy.positions}</h2>
        {portfolio.positions.length === 0 ? (
          <div className="empty-state">{copy.noPositions}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.market}</th>
                <th>{copy.outcome}</th>
                <th>{copy.shares}</th>
                <th>{copy.avgPrice}</th>
                <th>{copy.realizedPnl}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((position) => (
                <tr key={position.id}>
                  <td className="muted">{getMarketTitle(position.marketId)}</td>
                  <td className="muted">{getOutcomeTitle(position.marketId, position.outcomeId)}</td>
                  <td>{formatQuantity(position.netQuantity, locale)}</td>
                  <td>{formatPrice(position.averageEntryPrice, locale)}</td>
                  <td>{formatUsdc(position.realizedPnl, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.openOrders}</h2>
        {portfolio.openOrders.length === 0 ? (
          <div className="empty-state">{copy.noOpenOrders}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.market}</th>
                <th>{copy.side}</th>
                <th>{copy.price}</th>
                <th>{copy.shares}</th>
                <th>{copy.remaining}</th>
                <th>{copy.status}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.openOrders.map((order) => (
                <tr key={order.id}>
                  <td className="muted">{getMarketTitle(order.marketId)}</td>
                  <td>{sideLabel(order.side)}</td>
                  <td>{formatPrice(order.price, locale)}</td>
                  <td>{formatQuantity(order.quantity, locale)}</td>
                  <td>{formatQuantity(order.remainingQuantity, locale)}</td>
                  <td>
                    <span className={`badge badge-${orderStatusTone(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.claims}</h2>
        {portfolio.claims.length === 0 ? (
          <div className="empty-state">{copy.noClaims}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.market}</th>
                <th>{copy.claimable}</th>
                <th>{copy.claimed}</th>
                <th>{copy.status}</th>
                <th>{copy.action}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="muted">{getMarketTitle(claim.marketId)}</td>
                  <td>{formatUsdc(claim.claimableAmount, locale)}</td>
                  <td>{formatUsdc(claim.claimedAmount, locale)}</td>
                  <td>
                    <span className={`badge badge-${claim.status === "claimable" ? "success" : claim.status === "claimed" ? "neutral" : "warning"}`}>
                      {claimStatusLabel(claim.status)}
                    </span>
                  </td>
                  <td>{claim.status === "claimable" ? copy.claimAction : copy.unavailableAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid">
        <article className="panel stack">
          <div className="badge badge-neutral">{baseNetworkLabel}</div>
          <h2 className="section-title">{copy.creditDeposit}</h2>
          <p className="muted">{interpolate(copy.creditDepositHint, { asset: baseSettlementAsset, network: baseNetworkLabel })}</p>
          <p className="muted">{copy.treasuryLabel}: {baseTreasuryAddress || "Set NEXT_PUBLIC_BASE_TREASURY_ADDRESS"}</p>
          <p className="muted">{copy.usdcTokenLabel}: {baseUsdcAddress || "Set NEXT_PUBLIC_BASE_USDC_ADDRESS"}</p>
          <p className="muted">{copy.depositVerificationHint}</p>
          <form action={verifyDepositAction} className="stack">
            <input name="txHash" placeholder={copy.txHashPlaceholder} required />
            <button type="submit">{copy.creditDepositButton}</button>
          </form>
        </article>

        <article className="panel stack">
          <div className="badge badge-neutral">{baseNetworkLabel}</div>
          <h2 className="section-title">{copy.requestWithdrawal}</h2>
          <p className="muted">{interpolate(copy.requestWithdrawalHint, { network: baseNetworkLabel })}</p>
          <form action={requestWithdrawalAction} className="stack">
            <input name="amountAtoms" type="number" min="1" step="1" placeholder={copy.amountPlaceholder} required />
            <input name="destinationAddress" placeholder={copy.destinationPlaceholder} required />
            <button type="submit">{copy.requestWithdrawalButton}</button>
          </form>
        </article>
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.depositHistory}</h2>
        <div className="badge badge-neutral">{baseNetworkLabel}</div>
        {portfolio.deposits.length === 0 ? (
          <div className="empty-state">{copy.noDeposits}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.txHash}</th>
                <th>{copy.amount}</th>
                <th>{copy.status}</th>
                <th>{copy.verifiedAtColumn}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.deposits.map((deposit) => (
                <tr key={deposit.id}>
                  <td><a className="mono" href={formatBaseExplorerTxUrl(deposit.txHash)} target="_blank" rel="noreferrer">{deposit.txHash.slice(0, 10)}…{deposit.txHash.slice(-8)}</a></td>
                  <td>{formatUsdc(deposit.amount, locale)} {deposit.currency}</td>
                  <td>
                    <span className={`badge badge-${depositTone(deposit.txStatus)}`}>{depositStatusLabel(deposit.txStatus)}</span>
                  </td>
                  <td>{formatDateTime(locale, deposit.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.withdrawalHistory}</h2>
        <div className="badge badge-neutral">{baseNetworkLabel}</div>
        {portfolio.withdrawals.length === 0 ? (
          <div className="empty-state">{copy.noWithdrawals}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.destination}</th>
                <th>{copy.amount}</th>
                <th>{copy.status}</th>
                <th>{copy.timeline}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.withdrawals.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td className="mono">{withdrawal.destinationAddress}</td>
                  <td>{formatUsdc(withdrawal.amountAtoms, locale)}</td>
                  <td>
                    <span className={`badge badge-${withdrawalTone(withdrawal.status)}`}>{withdrawalStatusLabel(withdrawal.status)}</span>
                  </td>
                  <td>
                    {copy.requestedAt}: {formatDateTime(locale, withdrawal.requestedAt)}
                    {withdrawal.processedAt ? ` · ${copy.processedAt}: ${formatDateTime(locale, withdrawal.processedAt)}` : ""}
                    {withdrawal.txHash ? (
                      <>
                        {` · ${copy.transaction}: `}
                        <a className="mono" href={formatBaseExplorerTxUrl(withdrawal.txHash)} target="_blank" rel="noreferrer">
                          {withdrawal.txHash.slice(0, 10)}…{withdrawal.txHash.slice(-8)}
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
