import { notFound } from "next/navigation";

import { renderPolymarketSlugPage } from "../../../polymarket/[slug]/page";
import { pathSegmentToLocale } from "../../../../lib/locale";

export default async function LocalePolymarketSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<{ ref?: string }>;
}) {
  const resolved = await params;
  const locale = pathSegmentToLocale(resolved.locale);
  if (!locale) notFound();
  return renderPolymarketSlugPage(locale, {
    params: Promise.resolve({ slug: resolved.slug }),
    searchParams,
  });
}
