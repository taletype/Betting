import { apiRequest, toBigInt } from "../../../lib/api";

import { claimMarketAction } from "./actions";

interface MarketDetailPageProps {
  params: Promise<{ marketId: string }>;
}

interface MarketResponse {
  market: {
    id: string;
    title: string;
    status: string;
    outcomes: { id: string; title: string }[];
  } | null;
}

interface ClaimStateResponse {
  claimState: {
    marketId: string;
    claimableAmount: string;
    claimedAmount: string;
    status: "blocked" | "claimable" | "claimed";
  };
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { marketId } = await params;
  const marketResponse = await apiRequest<MarketResponse>(`/markets/${marketId}`);
  const market = marketResponse.market;

  if (!market) {
    return (
      <main className="stack">
        <section className="hero">
          <h1>Market not found</h1>
        </section>
      </main>
    );
  }

  let claimState: ClaimStateResponse["claimState"] | null = null;
  if (market.status === "resolved") {
    try {
      const payload = await apiRequest<ClaimStateResponse>(`/claims/${marketId}/state`);
      claimState = payload.claimState;
    } catch {
      claimState = null;
    }
  }

  return (
    <main className="stack">
      <section className="hero">
        <h1>{market.title}</h1>
        <p>Market status: {market.status}</p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>Outcomes</strong>
          {market.outcomes.map((outcome) => (
            <div key={outcome.id} className="muted">
              {outcome.title}
            </div>
          ))}
        </div>
        <div className="panel stack">
          <strong>Claim</strong>
          {claimState ? (
            <>
              <div className="muted">Status: {claimState.status}</div>
              <div>Claimable: {toBigInt(claimState.claimableAmount).toString()}</div>
              <div>Claimed: {toBigInt(claimState.claimedAmount).toString()}</div>
              {claimState.status === "claimable" ? (
                <form action={claimMarketAction}>
                  <input type="hidden" name="marketId" value={market.id} />
                  <button type="submit">Claim payout</button>
                </form>
              ) : null}
            </>
          ) : (
            <div className="muted">Claiming becomes available after final resolution.</div>
          )}
        </div>
      </section>
    </main>
  );
}
