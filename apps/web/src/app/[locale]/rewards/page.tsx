import { notFound } from "next/navigation";

import { renderRewardsPage } from "../../rewards/page";
import { pathSegmentToLocale } from "../../../lib/locale";

export default async function LocaleRewardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = pathSegmentToLocale((await params).locale);
  if (!locale) notFound();
  return renderRewardsPage(locale);
}
