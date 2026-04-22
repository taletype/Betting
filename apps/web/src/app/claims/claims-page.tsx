import { getPortfolio, listMarkets } from "../../lib/api";
import { formatUsdc } from "../../lib/format";
import { formatDateTime, getLocaleCopy, type AppLocale } from "../../lib/locale";

const claimTone = (status: string): "success" | "neutral" | "warning" => {
  if (status === "claimable") {
    return "success";
  }

  if (status === "claimed") {
    return "neutral";
  }

  return "warning";
};

export async function renderClaimsPage(locale: AppLocale) {
  const copy = getLocaleCopy(locale).claims;
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
  const marketTitleById = new Map(markets.map((market) => [market.id, market.title]));

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
          <strong>{copy.claimableNow}</strong>
          <div className="metric">
            {formatUsdc(
              portfolio.claims
                .filter((claim) => claim.status === "claimable")
                .reduce((total, claim) => total + BigInt(claim.claimableAmount), 0n),
              locale,
            )}
          </div>
          <div className="muted">{copy.claimableNowHint}</div>
        </div>
        <div className="panel stack">
          <strong>{copy.claimedLifetime}</strong>
          <div className="metric">
            {formatUsdc(portfolio.claims.reduce((total, claim) => total + BigInt(claim.claimedAmount), 0n), locale)}
          </div>
          <div className="muted">{copy.claimedLifetimeHint}</div>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.historyTitle}</h2>
        {portfolio.claims.length === 0 ? (
          <div className="empty-state">{copy.noClaims}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.market}</th>
                <th>{copy.status}</th>
                <th>{copy.claimable}</th>
                <th>{copy.claimed}</th>
                <th>{copy.updated}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.claims.map((claim) => (
                <tr key={claim.id}>
                  <td>{marketTitleById.get(claim.marketId) ?? `${claim.marketId.slice(0, 8)}…`}</td>
                  <td>
                    <span className={`badge badge-${claimTone(claim.status)}`}>{copy.statuses[claim.status] ?? claim.status}</span>
                  </td>
                  <td>{formatUsdc(claim.claimableAmount, locale)}</td>
                  <td>{formatUsdc(claim.claimedAmount, locale)}</td>
                  <td>{formatDateTime(locale, claim.updatedAt, "UTC")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
