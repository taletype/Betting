import { renderClaimsPage } from "./claims-page";
import { defaultLocale } from "../../lib/locale";

export default async function ClaimsPage() {
  return renderClaimsPage(defaultLocale);
}
