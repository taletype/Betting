import React from "react";
import { renderExternalMarketsPage } from "./external-markets-page";

export const dynamic = "force-dynamic";

export default async function ExternalMarketsPage() {
  return renderExternalMarketsPage("en");
}
