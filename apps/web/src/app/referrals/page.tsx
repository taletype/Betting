import { redirect } from "next/navigation";

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const code = params?.ref ?? params?.code;
  redirect(code ? `/ambassador?ref=${encodeURIComponent(code)}` : "/ambassador");
}
