"use server";

import { revalidatePath } from "next/cache";

import { apiRequest } from "../../../lib/api";

export const claimMarketAction = async (formData: FormData) => {
  const marketId = String(formData.get("marketId") ?? "");

  await apiRequest(`/claims/${marketId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/portfolio");
};
