import { notFound } from "next/navigation";
import type React from "react";

const guidePages: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  "fees-and-builder-code": () => import("../../../guides/fees-and-builder-code/page"),
  "how-polymarket-routing-works": () => import("../../../guides/how-polymarket-routing-works/page"),
  "invite-rewards": () => import("../../../guides/invite-rewards/page"),
  "polygon-pusd-payouts": () => import("../../../guides/polygon-pusd-payouts/page"),
};

export default async function LocaleGuideSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const load = guidePages[slug];
  if (!load) notFound();
  const Page = (await load()).default;
  return <Page />;
}
