import { renderMarketsPage } from "../../markets/markets-page";

export const dynamic = "force-dynamic";

export default async function ChineseMarketsPage() {
  return renderMarketsPage("zh-CN");
}
