"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@bet/supabase/server";

import { captureAmbassadorReferral } from "../lib/api";
import { buildMagicLinkRedirectTo } from "../lib/auth-redirect";
import { pendingReferralCookieName } from "../lib/referral-capture";
import { isPublicSupabaseConfigError } from "../lib/supabase/config";

const getSiteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const getServerSupabase = async () => {
  const cookieStore = await cookies();
  return createSupabaseServerClient({
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, options) => cookieStore.set(name, value, options),
    remove: (name, options) => cookieStore.delete({ name, ...options }),
  });
};

export const sendMagicLinkAction = async (formData: FormData) => {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/account");
  if (!email) {
    redirect("/login?sent=0");
  }

  try {
    const supabase = await getServerSupabase();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildMagicLinkRedirectTo(getSiteUrl(), next),
      },
    });
  } catch (error) {
    console.warn("magic link auth failed", error);
    redirect(isPublicSupabaseConfigError(error) ? "/login?auth=unavailable" : "/login?auth=failed");
  }

  redirect("/login?sent=1");
};

export const logoutAction = async () => {
  try {
    const supabase = await getServerSupabase();
    await supabase.auth.signOut();
  } catch (error) {
    console.warn("logout skipped because auth is not configured", error);
  }

  redirect("/login");
};

export const applyReferralCodeAction = async (formData: FormData) => {
  const cookieStore = await cookies();
  const explicitCode = String(formData.get("code") ?? "").trim();
  const cookieCode = cookieStore.get(pendingReferralCookieName)?.value ?? "";
  const code = explicitCode || cookieCode;
  if (!code) {
    redirect("/ambassador?referral=missing");
  }

  try {
    await captureAmbassadorReferral(code);
    cookieStore.delete(pendingReferralCookieName);
  } catch (error) {
    console.warn("failed to apply referral code", error);
    redirect("/ambassador?referral=failed");
  }

  revalidatePath("/account");
  revalidatePath("/ambassador");
  redirect("/ambassador?referral=applied");
};
