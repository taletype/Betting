import { notFound } from "next/navigation";

import { renderPolymarketPageForLocale } from "../../polymarket/page";
import { pathSegmentToLocale } from "../../../lib/locale";

export default async function LocalePolymarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ q?: string; status?: string; sort?: string; ref?: string; market?: string; view?: string; offset?: string; limit?: string }>;
}) {
  const locale = pathSegmentToLocale((await params).locale);
  if (!locale) notFound();
  return renderPolymarketPageForLocale(locale, searchParams);
}
