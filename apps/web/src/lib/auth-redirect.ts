const defaultAuthNextPath = "/account";
const controlCharacters = /[\u0000-\u001F\u007F]/;

const normalizeSiteOrigin = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.protocol = "https:";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return "";
  }
};

const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production";

const isLocalhostOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(value);
  }
};

export const getMagicLinkSiteUrl = (): string => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;
  const normalized = configured ? normalizeSiteOrigin(configured) : "";

  if (normalized && !(isProductionRuntime() && isLocalhostOrigin(normalized))) return normalized;
  if (isProductionRuntime()) {
    console.error("magic link site URL is not configured for production");
    throw new Error("AUTH_SITE_URL_REQUIRED");
  }

  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
};

export const isSafeAuthNextPath = (pathname: string): boolean => {
  if (pathname === "/") return true;
  if (pathname === "/polymarket") return true;
  if (/^\/polymarket\/[^/?#]+$/.test(pathname)) return true;
  return ["/ambassador", "/rewards", "/account"].includes(pathname);
};

export const normalizeAuthNextPath = (
  value: string | null | undefined,
  fallback = defaultAuthNextPath,
): string => {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || controlCharacters.test(raw)) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "https://bet.internal");
    if (parsed.origin !== "https://bet.internal") return fallback;
    if (!isSafeAuthNextPath(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
};

const normalizeAuthReferralCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9_-]{3,64}$/.test(normalized) ? normalized : null;
};

export const buildMagicLinkRedirectTo = (siteUrl: string, next: string | null | undefined, ref?: string | null): string => {
  const safeSiteUrl = siteUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({ next: normalizeAuthNextPath(next) });
  const refCode = normalizeAuthReferralCode(ref);
  if (refCode) params.set("ref", refCode);
  return `${safeSiteUrl}/auth/callback?${params.toString()}`;
};
