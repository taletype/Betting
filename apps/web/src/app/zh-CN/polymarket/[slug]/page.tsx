import { redirect } from "next/navigation";

interface ChinesePolymarketSlugPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function ChinesePolymarketSlugPage({ params }: ChinesePolymarketSlugPageProps) {
  const { slug } = await params;
  redirect(`/polymarket/${encodeURIComponent(slug)}`);
}
