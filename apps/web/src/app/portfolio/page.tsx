import { renderPortfolioPage } from "./portfolio-page";
import { defaultLocale } from "../../lib/locale";

export default async function PortfolioPage() {
  return renderPortfolioPage(defaultLocale);
}
