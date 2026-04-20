import { apiRequest } from "../../lib/api";

import { resolveMarketAction } from "./actions";

interface MarketResponse {
  id: string;
  title: string;
  status: string;
  outcomes: { id: string; title: string }[];
}

export default async function AdminPage() {
  const markets = await apiRequest<MarketResponse[]>("/markets");

  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Resolve eligible markets by selecting the winning outcome and attaching evidence metadata.</p>
      </section>
      <section className="stack">
        {markets.map((market) => (
          <article className="panel stack" key={market.id}>
            <div className="muted">{market.status.toUpperCase()}</div>
            <strong>{market.title}</strong>
            <form action={resolveMarketAction} className="stack">
              <input type="hidden" name="marketId" value={market.id} />
              <label className="stack">
                Winning outcome
                <select name="winningOutcomeId" defaultValue={market.outcomes[0]?.id} required>
                  {market.outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>
                      {outcome.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack">
                Resolver identity
                <input name="resolverId" placeholder="ops-admin-1" required />
              </label>
              <label className="stack">
                Evidence text
                <textarea name="evidenceText" rows={3} required />
              </label>
              <label className="stack">
                Evidence URL (optional)
                <input name="evidenceUrl" type="url" placeholder="https://example.com/proof" />
              </label>
              <button type="submit">Resolve market</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
