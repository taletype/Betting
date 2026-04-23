import { renderMarketsPage } from "./markets-page";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  return renderMarketsPage("en");
}
