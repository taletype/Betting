"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@bet/supabase/server";

import { requestAmbassadorPayout } from "../../lib/api";

const requireCurrentUser = async () => {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    get: (name) => cookieStore.get(name)?.value,
  });
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("Authentication required");
  }

  return data.user;
};

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
