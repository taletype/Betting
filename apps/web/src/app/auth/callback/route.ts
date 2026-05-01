import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@bet/supabase/server";
import { captureAmbassadorReferralDb } from "../../api/_shared/ambassador";
import { normalizeAuthNextPath } from "../../../lib/auth-redirect";
import {
  createReferralApplyIdempotencyKey,
  isTerminalReferralApplyFailure,
  normalizeReferralCode,
  pendingReferralCookieName,
} from "../../../lib/referral-capture";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseServerClientFactory = typeof createSupabaseServerClient;
type ReferralApplier = typeof captureAmbassadorReferralDb;
type AuthCallbackOtpType = EmailOtpType;

let supabaseServerClientFactory: SupabaseServerClientFactory = createSupabaseServerClient;
let referralApplier: ReferralApplier = captureAmbassadorReferralDb;

export const setAuthCallbackDependenciesForTests = (dependencies: {
  supabaseServerClientFactory?: SupabaseServerClientFactory | null;
  referralApplier?: ReferralApplier | null;
}): void => {
  supabaseServerClientFactory = dependencies.supabaseServerClientFactory ?? createSupabaseServerClient;
  referralApplier = dependencies.referralApplier ?? captureAmbassadorReferralDb;
};

const callbackFailureRedirect = (requestUrl: URL, next: string, refCode: string | null): NextResponse => {
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("auth", "callback_failed");
  loginUrl.searchParams.set("next", next);
  if (refCode) loginUrl.searchParams.set("ref", refCode);
  return NextResponse.redirect(loginUrl);
};

const clearPendingReferralCookie = (response: NextResponse): void => {
  response.cookies.delete({ name: pendingReferralCookieName, path: "/" });
};

const getPendingReferralCode = (request: NextRequest): string | null =>
  normalizeReferralCode(request.cookies.get(pendingReferralCookieName)?.value);

const authCallbackOtpTypes = new Set<AuthCallbackOtpType>([
  "magiclink",
  "email",
]);

const normalizeAuthCallbackOtpType = (value: string | null): AuthCallbackOtpType | null =>
  value && authCallbackOtpTypes.has(value as AuthCallbackOtpType) ? (value as AuthCallbackOtpType) : null;

const applyPendingReferral = async (
  request: NextRequest,
  response: NextResponse,
  userId: string,
  urlRefCode: string | null,
): Promise<void> => {
  const rawPendingCode = request.cookies.get(pendingReferralCookieName)?.value;
  const cookieCode = getPendingReferralCode(request);
  if (rawPendingCode && !cookieCode) {
    clearPendingReferralCookie(response);
  }
  const code = urlRefCode ?? cookieCode;
  if (!code) return;

  try {
    await referralApplier(userId, code, {
      idempotencyKey: createReferralApplyIdempotencyKey(code),
      sessionId: request.cookies.get("bet_referral_session_id")?.value ?? null,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    });
    clearPendingReferralCookie(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("failed to apply pending referral after auth callback", {
      terminal: isTerminalReferralApplyFailure(0, message),
    });
    if (isTerminalReferralApplyFailure(0, message)) {
      clearPendingReferralCookie(response);
    }
  }
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const tokenType = requestUrl.searchParams.get("type");
  const requestedNext = requestUrl.searchParams.get("next") ?? "/account";
  const next = normalizeAuthNextPath(requestedNext);
  const refCode = normalizeReferralCode(requestUrl.searchParams.get("ref"));

  if (!code && !tokenHash) {
    return callbackFailureRedirect(requestUrl, next, refCode);
  }

  const successUrl = new URL(next, requestUrl.origin);
  if (refCode && successUrl.pathname === "/polymarket" && !successUrl.searchParams.has("ref")) {
    successUrl.searchParams.set("ref", refCode);
  }
  const response = NextResponse.redirect(successUrl);

  try {
    const supabase: SupabaseServerClient = supabaseServerClientFactory({
      get: (name) => request.cookies.get(name)?.value,
      set: (name, value, options) => response.cookies.set(name, value, options),
      remove: (name, options) => response.cookies.delete({ name, ...options }),
    });
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        throw exchangeError;
      }
    } else if (tokenHash && tokenType) {
      const otpType = normalizeAuthCallbackOtpType(tokenType);
      if (!otpType) {
        throw new Error("auth callback has unsupported token type");
      }
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (otpError) {
        throw otpError;
      }
    } else {
      throw new Error("auth callback missing token type");
    }
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      throw userError ?? new Error("auth callback did not return a session user");
    }

    await applyPendingReferral(request, response, data.user.id, refCode);
  } catch (error) {
    console.warn("failed to complete auth callback", { reason: error instanceof Error && error.message === "auth callback has unsupported token type" ? "unsupported_token_type" : "callback_failed" });
    return callbackFailureRedirect(requestUrl, next, refCode);
  }

  return response;
}
