import { notFound } from "next/navigation";

import { renderAmbassadorPage } from "../../ambassador/page";
import { pathSegmentToLocale } from "../../../lib/locale";

export default async function LocaleAmbassadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = pathSegmentToLocale((await params).locale);
  if (!locale) notFound();
  return renderAmbassadorPage(locale, { searchParams });
}
