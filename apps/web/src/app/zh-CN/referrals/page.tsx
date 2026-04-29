import { redirect } from "next/navigation";

export default async function ChineseReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  redirect(params?.code ? `/ambassador?ref=${encodeURIComponent(params.code)}` : "/ambassador");
}
