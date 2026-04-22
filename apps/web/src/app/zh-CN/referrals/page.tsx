import { renderReferralsPage } from "../../referrals/referrals-page";

export default async function ChineseReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  return renderReferralsPage("zh-CN", { searchParams });
}
