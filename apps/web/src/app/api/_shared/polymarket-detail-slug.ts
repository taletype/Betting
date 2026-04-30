export interface PolymarketDetailSlugResolution {
  originalSlug: string;
  decodedSlug: string;
  canonicalSlug: string;
  candidates: string[];
  strippedNumericSuffix: boolean;
}

const NUMERIC_SUFFIX_PATTERN = /-\d+$/;

export const resolvePolymarketDetailSlug = (slug: string): PolymarketDetailSlugResolution => {
  const decodedSlug = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })().trim();
  const canonicalSlug = decodedSlug.replace(NUMERIC_SUFFIX_PATTERN, "");
  const strippedNumericSuffix = canonicalSlug !== decodedSlug;
  const candidates = [...new Set([decodedSlug, canonicalSlug].filter(Boolean))];

  return {
    originalSlug: slug,
    decodedSlug,
    canonicalSlug,
    candidates,
    strippedNumericSuffix,
  };
};
