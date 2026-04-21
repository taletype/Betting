const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePrimitive = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

export const normalizeApiPayload = (value: unknown): unknown => {
  const normalizedPrimitive = normalizePrimitive(value);
  if (normalizedPrimitive !== value) {
    return normalizedPrimitive;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeApiPayload(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeApiPayload(entry)]));
  }

  return value;
};
