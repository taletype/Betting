import { renderExternalMarketsPage } from "../../external-markets/external-markets-page";

export const dynamic = "force-dynamic";

export default async function ChineseExternalMarketsPage() {
  return renderExternalMarketsPage("zh-CN");
}
