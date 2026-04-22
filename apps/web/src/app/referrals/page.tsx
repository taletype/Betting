import { renderReferralsPage } from "./referrals-page";

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  return renderReferralsPage("en", { searchParams });
}
