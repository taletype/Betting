const defaultAuthNextPath = "/account";
const controlCharacters = /[\u0000-\u001F\u007F]/;

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
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
};

export const buildMagicLinkRedirectTo = (siteUrl: string, next: string | null | undefined): string => {
  const safeSiteUrl = siteUrl.replace(/\/+$/, "");
  return `${safeSiteUrl}/auth/callback?next=${encodeURIComponent(normalizeAuthNextPath(next))}`;
};
