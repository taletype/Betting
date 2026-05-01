import { notFound } from "next/navigation";

import { renderGuidesPage } from "../../guides/page";
import { pathSegmentToLocale } from "../../../lib/locale";

export default async function LocaleGuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = pathSegmentToLocale((await params).locale);
  if (!locale) notFound();
  return renderGuidesPage(locale);
}
