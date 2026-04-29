import React from "react";

import { renderExternalMarketsPage } from "../external-markets/external-markets-page";
import { defaultLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";

export default async function PolymarketPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; sort?: string; ref?: string; market?: string }>;
} = {}) {
  return renderExternalMarketsPage(defaultLocale, await searchParams);
}
