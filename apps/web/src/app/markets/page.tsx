import { renderMarketsPage } from "./markets-page";
import { defaultLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  return renderMarketsPage(defaultLocale);
}
