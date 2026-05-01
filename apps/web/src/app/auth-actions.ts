"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@bet/supabase/server";

import { captureAmbassadorReferral } from "../lib/api";
import { buildMagicLinkRedirectTo, getMagicLinkSiteUrl, normalizeAuthNextPath } from "../lib/auth-redirect";
import { normalizeReferralCode, pendingReferralCookieName } from "../lib/referral-capture";
import { isPublicSupabaseConfigError } from "../lib/supabase/config";

const getServerSupabase = async () => {
  const cookieStore = await cookies();
  return createSupabaseServerClient({
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, options) => cookieStore.set(name, value, options),
    remove: (name, options) => cookieStore.delete({ name, ...options }),
  });
};

const loginRedirect = (params: Record<string, string | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/login?${query}` : "/login";
};

export const sendMagicLinkAction = async (formData: FormData) => {
  const email = String(formData.get("email") ?? "").trim();
  const next = normalizeAuthNextPath(String(formData.get("next") ?? "/account"));
  const refCode = normalizeReferralCode(String(formData.get("ref") ?? ""));
  if (!email) {
    redirect(loginRedirect({ sent: "0", next, ref: refCode ?? undefined }));
  }

  try {
    const supabase = await getServerSupabase();
    const siteUrl = getMagicLinkSiteUrl();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildMagicLinkRedirectTo(siteUrl, next, refCode),
      },
    });
  } catch (error) {
    const unavailable = isPublicSupabaseConfigError(error) || (error instanceof Error && error.message === "AUTH_SITE_URL_REQUIRED");
    console.warn("magic link auth failed", { reason: unavailable ? "auth_unavailable" : "send_failed" });
    redirect(loginRedirect({ auth: unavailable ? "unavailable" : "failed", next, ref: refCode ?? undefined }));
  }

  redirect(loginRedirect({ sent: "1", next, ref: refCode ?? undefined }));
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
