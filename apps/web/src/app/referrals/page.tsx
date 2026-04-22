import { revalidatePath } from "next/cache";

import { getMlmDashboard, joinReferralProgram } from "../../lib/api";
import { formatUsdc } from "../../lib/format";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const dashboard = await getMlmDashboard();

  const joinAction = async (formData: FormData) => {
    "use server";
    await joinReferralProgram(String(formData.get("code") ?? ""));
    revalidatePath("/referrals");
    revalidatePath("/admin");
  };

  return (
    <main className="stack">
      <section className="hero">
        <h1>Referrals</h1>
        <p>Grow your network, track downline activity, and review deposit-based MLM commissions.</p>
      </section>

      <section className="grid">
        <div className="panel stack">
          <strong>Your Invite Code</strong>
          <div className="metric">{dashboard.referralCode.code}</div>
          <div className="muted">{dashboard.referralCode.inviteUrl}</div>
        </div>
        <div className="panel stack">
          <strong>Lifetime Commission</strong>
          <div className="metric">{formatUsdc(dashboard.metrics.lifetimeCommission)}</div>
          <div className="muted">Last 30 days: {formatUsdc(dashboard.metrics.recentCommission30d)}</div>
        </div>
        <div className="panel stack">
          <strong>Downline</strong>
          <div className="metric">{dashboard.metrics.totalDownlineCount}</div>
          <div className="muted">Direct referrals: {dashboard.metrics.directReferralCount}</div>
        </div>
      </section>

      <section className="grid">
        <div className="panel stack">
          <h2 className="section-title">Sponsor</h2>
          {dashboard.sponsor ? (
            <>
              <strong>{dashboard.sponsor.displayName ?? dashboard.sponsor.username ?? dashboard.sponsor.userId}</strong>
              <div className="muted">Joined {formatDate(dashboard.sponsor.assignedAt)}</div>
              <div className="badge badge-neutral">{dashboard.sponsor.referralCode ?? "No code"}</div>
            </>
          ) : (
            <div className="empty-state">No sponsor attached yet. Join an upline with a referral code.</div>
          )}
        </div>

        <div className="panel stack">
          <h2 className="section-title">Join With Code</h2>
          <form action={joinAction} className="stack">
            <label className="stack">
              Referral code
              <input name="code" defaultValue={params.code ?? ""} placeholder="DEMO1001" required />
            </label>
            <button type="submit">Attach Sponsor</button>
          </form>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Direct Referrals</h2>
        {dashboard.directReferrals.length === 0 ? (
          <div className="empty-state">No direct referrals yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.directReferrals.map((member) => (
                <tr key={member.userId}>
                  <td>{member.displayName ?? member.username ?? member.userId}</td>
                  <td>{formatDate(member.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Commission History</h2>
        {dashboard.commissions.length === 0 ? (
          <div className="empty-state">No commissions credited yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Level</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.commissions.map((commission) => (
                <tr key={commission.id}>
                  <td>{commission.sourceDisplayName ?? commission.sourceUserId}</td>
                  <td>Level {commission.levelDepth}</td>
                  <td>{formatUsdc(commission.amount)}</td>
                  <td>{commission.payoutStatus}</td>
                  <td>{formatDate(commission.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
