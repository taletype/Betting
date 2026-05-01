const defaultAuthNextPath = "/account";
const controlCharacters = /[\u0000-\u001F\u007F]/;

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

export const buildMagicLinkRedirectTo = (siteUrl: string, next: string | null | undefined): string => {
  const safeSiteUrl = siteUrl.replace(/\/+$/, "");
  return `${safeSiteUrl}/auth/callback?next=${encodeURIComponent(normalizeAuthNextPath(next))}`;
};
