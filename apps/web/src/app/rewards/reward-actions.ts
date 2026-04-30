"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requestAmbassadorPayout } from "../../lib/api";
import { requireCurrentUser } from "../../lib/supabase/server";

export const requestRewardPayoutAction = async (formData: FormData) => {
  await requireCurrentUser();
  const destinationValue = String(formData.get("destinationValue") ?? "").trim();
  await requestAmbassadorPayout({
    destinationType: "wallet",
    destinationValue,
  });
  revalidatePath("/rewards");
  redirect("/rewards");
};
