"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requestAmbassadorPayout } from "../../lib/api";

export const requestRewardPayoutAction = async (formData: FormData) => {
  const destinationValue = String(formData.get("destinationValue") ?? "").trim();
  await requestAmbassadorPayout({
    destinationType: "wallet",
    destinationValue,
  });
  revalidatePath("/rewards");
  redirect("/rewards");
};
