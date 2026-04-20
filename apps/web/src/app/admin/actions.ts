"use server";

import { revalidatePath } from "next/cache";

import { apiRequest } from "../../lib/api";

export const resolveMarketAction = async (formData: FormData) => {
  const marketId = String(formData.get("marketId") ?? "");
  const winningOutcomeId = String(formData.get("winningOutcomeId") ?? "");
  const evidenceText = String(formData.get("evidenceText") ?? "");
  const evidenceUrlRaw = String(formData.get("evidenceUrl") ?? "").trim();
  const resolverId = String(formData.get("resolverId") ?? "");

  await apiRequest(`/admin/markets/${marketId}/resolve`, {
    method: "POST",
    headers: {
      "x-admin-token": process.env.ADMIN_API_TOKEN ?? "dev-admin-token",
    },
    body: JSON.stringify({
      winningOutcomeId,
      evidenceText,
      evidenceUrl: evidenceUrlRaw ? evidenceUrlRaw : null,
      resolverId,
    }),
  });

  revalidatePath("/admin");
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/portfolio");
};
