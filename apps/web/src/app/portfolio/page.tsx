import { getPortfolio, linkWallet, toBigInt, verifyDepositTx } from "../../lib/api";

const formatTicks = (value: bigint): string => value.toString();

export default async function PortfolioPage() {
  const portfolio = await getPortfolio();
  const primaryBalance = portfolio.balances[0];

  const linkWalletAction = async (formData: FormData) => {
    "use server";
    await linkWallet({
      walletAddress: String(formData.get("walletAddress") ?? ""),
      signedMessage: String(formData.get("signedMessage") ?? ""),
      signature: String(formData.get("signature") ?? ""),
    });
  };

  const verifyDepositAction = async (formData: FormData) => {
    "use server";
    await verifyDepositTx(String(formData.get("txHash") ?? ""));
  };

  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Base deposits credit via ledger journals only.</p>
      </section>

      <section className="grid">
        <div className="panel stack">
          <strong>Available Balance</strong>
          <div className="metric">{primaryBalance ? formatTicks(primaryBalance.available) : "0"}</div>
          <div className="muted">{primaryBalance?.currency ?? "USDC"} available.</div>
        </div>
        <div className="panel stack">
          <strong>Reserved</strong>
          <div className="metric">{primaryBalance ? formatTicks(primaryBalance.reserved) : "0"}</div>
          <div className="muted">Reserved for open orders.</div>
        </div>
      </section>

      <section className="panel stack">
        <h2>Linked Base Wallet</h2>
        {portfolio.linkedWallet ? (
          <div>
            <div>{portfolio.linkedWallet.walletAddress}</div>
            <div className="muted">Verified {new Date(portfolio.linkedWallet.verifiedAt).toISOString()}</div>
          </div>
        ) : (
          <div className="muted">No linked wallet yet.</div>
        )}

        <form action={linkWalletAction} className="stack">
          <input name="walletAddress" placeholder="0x..." required />
          <textarea name="signedMessage" placeholder="Bet wallet link\nuser:...\nnonce:..." required />
          <textarea name="signature" placeholder="0x signature" required />
          <button type="submit">Link Wallet</button>
        </form>
      </section>

      <section className="panel stack">
        <h2>Verify Base Deposit</h2>
        <form action={verifyDepositAction} className="stack">
          <input name="txHash" placeholder="0x transaction hash" required />
          <button type="submit">Verify Deposit</button>
        </form>
      </section>

      <section className="panel stack">
        <h2>Deposit History</h2>
        {portfolio.deposits.length === 0 ? <div className="muted">No deposits credited yet.</div> : null}
        {portfolio.deposits.map((deposit) => (
          <div key={deposit.id}>
            <div>{deposit.txHash}</div>
            <div>
              Amount: {toBigInt(deposit.amount).toString()} {deposit.currency} · Status: {deposit.txStatus}
            </div>
            <div className="muted">{new Date(deposit.verifiedAt).toISOString()}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
