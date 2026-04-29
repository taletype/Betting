import { redirect } from "next/navigation";

interface PolymarketSlugPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function PolymarketSlugPage({ params }: PolymarketSlugPageProps) {
  const { slug } = await params;
  redirect(`/polymarket?market=${encodeURIComponent(slug)}`);
}
