import { revalidatePath } from "next/cache";

import { getMlmDashboard, joinReferralProgram } from "../../lib/api";
import { formatUsdc } from "../../lib/format";
import { formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../lib/locale";

export async function renderReferralsPage(
  locale: AppLocale,
  {
    searchParams,
  }: {
    searchParams?: Promise<{ code?: string }>;
  },
) {
  const copy = getLocaleCopy(locale).referrals;
  const params = (await searchParams) ?? {};
  const dashboard = await getMlmDashboard();

  const joinAction = async (formData: FormData) => {
    "use server";
    await joinReferralProgram(String(formData.get("code") ?? ""));
    revalidatePath(getLocaleHref(locale, "/referrals"));
    revalidatePath("/admin");
  };

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </section>

      <section className="grid">
        <div className="panel stack">
          <strong>{copy.inviteCode}</strong>
          <div className="metric">{dashboard.referralCode.code}</div>
          <div className="muted">{dashboard.referralCode.inviteUrl}</div>
        </div>
        <div className="panel stack">
          <strong>{copy.lifetimeCommission}</strong>
          <div className="metric">{formatUsdc(dashboard.metrics.lifetimeCommission, locale)}</div>
          <div className="muted">{copy.last30Days}: {formatUsdc(dashboard.metrics.recentCommission30d, locale)}</div>
        </div>
        <div className="panel stack">
          <strong>{copy.downline}</strong>
          <div className="metric">{dashboard.metrics.totalDownlineCount.toLocaleString(locale)}</div>
          <div className="muted">{copy.directReferrals}: {dashboard.metrics.directReferralCount.toLocaleString(locale)}</div>
        </div>
      </section>

      <section className="grid">
        <div className="panel stack">
          <h2 className="section-title">{copy.sponsor}</h2>
          {dashboard.sponsor ? (
            <>
              <strong>{dashboard.sponsor.displayName ?? dashboard.sponsor.username ?? dashboard.sponsor.userId}</strong>
              <div className="muted">{copy.joined} {formatDateTime(locale, dashboard.sponsor.assignedAt)}</div>
              <div className="badge badge-neutral">{dashboard.sponsor.referralCode ?? copy.noCode}</div>
            </>
          ) : (
            <div className="empty-state">{copy.noSponsor}</div>
          )}
        </div>

        <div className="panel stack">
          <h2 className="section-title">{copy.joinWithCode}</h2>
          <form action={joinAction} className="stack">
            <label className="stack">
              {copy.referralCode}
              <input name="code" defaultValue={params.code ?? ""} placeholder={copy.referralCodePlaceholder} required />
            </label>
            <button type="submit">{copy.attachSponsor}</button>
          </form>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.directReferralsTitle}</h2>
        {dashboard.directReferrals.length === 0 ? (
          <div className="empty-state">{copy.noDirectReferrals}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.member}</th>
                <th>{copy.joined}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.directReferrals.map((member) => (
                <tr key={member.userId}>
                  <td>{member.displayName ?? member.username ?? member.userId}</td>
                  <td>{formatDateTime(locale, member.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.commissionHistory}</h2>
        {dashboard.commissions.length === 0 ? (
          <div className="empty-state">{copy.noCommissions}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{copy.source}</th>
                <th>{copy.level}</th>
                <th>{copy.amount}</th>
                <th>{copy.status}</th>
                <th>{copy.created}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.commissions.map((commission) => (
                <tr key={commission.id}>
                  <td>{commission.sourceDisplayName ?? commission.sourceUserId}</td>
                  <td>{locale === "zh-CN" ? `${copy.levelPrefix} ${commission.levelDepth} 级` : `${copy.levelPrefix} ${commission.levelDepth}`}</td>
                  <td>{formatUsdc(commission.amount, locale)}</td>
                  <td>{commission.payoutStatus}</td>
                  <td>{formatDateTime(locale, commission.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
