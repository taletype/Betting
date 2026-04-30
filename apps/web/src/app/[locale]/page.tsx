import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { renderHomePage } from "../page";
import { pathSegmentToLocale } from "../../lib/locale";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = pathSegmentToLocale((await params).locale);
  if (locale === "en") {
    return { title: "Bet — Polymarket market tracking and referral tool", description: "Non-custodial Polymarket market tracking and referral tool." };
  }
  if (locale === "zh-CN") {
    return { title: "Bet — 中文 Polymarket 市场追踪与推荐工具", description: "非托管 Polymarket 市场追踪与推荐工具。" };
  }
  return { title: "Bet — 中文 Polymarket 市場追蹤與推薦工具", description: "非託管 Polymarket 市場追蹤與推薦工具。" };
}

export default async function LocaleHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ ref?: string }>;
}) {
  const locale = pathSegmentToLocale((await params).locale);
  if (!locale) notFound();
  return renderHomePage(locale, searchParams);
}
