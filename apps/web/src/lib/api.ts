const API_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const toQueryError = async (response: Response): Promise<Error> => {
  try {
    const payload = (await response.json()) as { error?: string };
    return new Error(payload.error ?? `request failed with status ${response.status}`);
  } catch {
    return new Error(`request failed with status ${response.status}`);
  }
};

export const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await toQueryError(response);
  }

  return (await response.json()) as T;
};

export const toBigInt = (value: string | number | bigint | null | undefined): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  if (!value) {
    return 0n;
  }

  return BigInt(value);
};
