import React from "react";

import { renderExternalMarketsPage } from "../external-markets/external-markets-page";
import { defaultLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";

export default async function PolymarketPage() {
  return renderExternalMarketsPage(defaultLocale);
}
