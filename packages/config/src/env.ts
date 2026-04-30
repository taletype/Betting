const LOCAL_ENVIRONMENTS = new Set(["development", "test", "local", ""]);

const readNodeEnv = (): string => process.env.NODE_ENV ?? "";

const isLocalEnvironment = (): boolean => LOCAL_ENVIRONMENTS.has(readNodeEnv());

const requiredEnvMessage = (name: string): string =>
  `${name} is required. Set ${name} in your deployment environment.`;

export const readRequiredString = (
  name: string,
  options?: { defaultInLocal?: string; defaultValue?: string },
): string => {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (options?.defaultValue !== undefined) {
    return options.defaultValue;
  }

  if (options?.defaultInLocal !== undefined && isLocalEnvironment()) {
    return options.defaultInLocal;
  }

  throw new Error(requiredEnvMessage(name));
};

export const readOptionalString = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value || null;
};

export const readRequiredUrl = (
  name: string,
  options?: { defaultInLocal?: string; defaultValue?: string },
): string => {
  const value = readRequiredString(name, options);

  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Received: ${value}`);
  }

  return value;
};

export const readPositiveInteger = (
  name: string,
  options?: { defaultInLocal?: number; defaultValue?: number },
): number => {
  const raw = process.env[name]?.trim();

  if (!raw) {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }

    if (options?.defaultInLocal !== undefined && isLocalEnvironment()) {
      return options.defaultInLocal;
    }

    throw new Error(requiredEnvMessage(name));
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`);
  }

  return parsed;
};

export const readEthereumAddress = (name: string, options?: { defaultInLocal?: string }): string => {
  const value = readRequiredString(name, options).toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte hex address. Received: ${value}`);
  }

  return value;
};

export const readOptionalBytes32Hex = (name: string): string | null => {
  const value = readOptionalString(name);

  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 0x-prefixed bytes32 hex string. Received: ${value}`);
  }

  return normalized;
};

export const readBooleanFlag = (
  name: string,
  options?: { defaultValue?: boolean },
): boolean => {
  const raw = readOptionalString(name);

  if (raw === null) {
    return options?.defaultValue ?? false;
  }

  const normalized = raw.toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`${name} must be true or false. Received: ${raw}`);
};

export const readStringList = (
  name: string,
  options?: { defaultValue?: readonly string[]; allowed?: readonly string[] },
): string[] => {
  const raw = readOptionalString(name);
  const values = raw
    ? raw.split(",").map((value) => value.trim()).filter(Boolean)
    : [...(options?.defaultValue ?? [])];

  if (options?.allowed) {
    const invalid = values.filter((value) => !options.allowed?.includes(value));
    if (invalid.length > 0) {
      throw new Error(`${name} contains unsupported value(s): ${invalid.join(", ")}`);
    }
  }

  return [...new Set(values)];
};

export const readChainId = (
  name: string,
  options?: { defaultInLocal?: number; defaultValue?: number; supported?: readonly number[] },
): number => {
  const chainId = readPositiveInteger(name, {
    defaultInLocal: options?.defaultInLocal,
    defaultValue: options?.defaultValue,
  });

  if (options?.supported && !options.supported.includes(chainId)) {
    throw new Error(
      `${name} must be one of: ${options.supported.join(", ")}. Received: ${chainId}`,
    );
  }

  return chainId;
};

export const readSecret = (name: string): string => {
  const value = readRequiredString(name);

  if (value === "replace-me" || value === "changeme") {
    throw new Error(`${name} cannot be a placeholder value`);
  }

  return value;
};

export const environment = {
  nodeEnv: readNodeEnv(),
  isLocal: isLocalEnvironment(),
  isProduction: readNodeEnv() === "production",
};
