import crypto from "node:crypto";

import { createDatabaseClient, type DatabaseExecutor } from "@bet/db";
import { verifyMessage } from "ethers";

import type { PolymarketL2Credentials } from "./submitter";
import { assertValidWalletAddress, normalizeDomain, normalizeWalletAddress } from "../wallets/challenge";

const ALGORITHM = "aes-256-gcm";
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{8,}$/;
const POLYMARKET_L2_SETUP_TTL_MS = 5 * 60 * 1000;
const POLYMARKET_L2_SETUP_ACTION = "polymarket_l2_credentials";

export type PolymarketL2CredentialPublicStatus = "present" | "missing" | "revoked";

export interface PolymarketL2CredentialStatusResult {
  status: PolymarketL2CredentialPublicStatus;
  walletAddress: string | null;
  updatedAt: string | null;
}

export interface PolymarketL2CredentialChallenge {
  action: typeof POLYMARKET_L2_SETUP_ACTION;
  domain: string;
  userId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export const isManualPolymarketL2CredentialInputEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_POLYMARKET_MANUAL_L2_CREDENTIALS_DEBUG === "true" ||
  process.env.POLYMARKET_MANUAL_L2_CREDENTIALS_DEBUG === "true";

export const isPolymarketL2CredentialDerivationEnabled = (): boolean =>
  process.env.POLYMARKET_L2_CREDENTIAL_DERIVATION_ENABLED === "true";

export const createPolymarketL2CredentialMessage = (challenge: PolymarketL2CredentialChallenge): string =>
  [
    "Bet Polymarket trading permissions",
    "",
    `Action: ${challenge.action}`,
    `Domain: ${challenge.domain}`,
    `User ID: ${challenge.userId}`,
    `Wallet: ${challenge.walletAddress}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expires At: ${challenge.expiresAt}`,
  ].join("\n");

export const createPolymarketL2CredentialChallenge = (input: {
  userId: string;
  walletAddress: string;
  domain: string;
  now?: Date;
  nonceFactory?: () => string;
}): { challenge: PolymarketL2CredentialChallenge; signedMessage: string } => {
  const now = input.now ?? new Date();
  const challenge: PolymarketL2CredentialChallenge = {
    action: POLYMARKET_L2_SETUP_ACTION,
    domain: normalizeDomain(input.domain),
    userId: input.userId,
    walletAddress: assertValidWalletAddress(input.walletAddress),
    nonce: input.nonceFactory?.() ?? crypto.randomBytes(32).toString("base64url"),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + POLYMARKET_L2_SETUP_TTL_MS).toISOString(),
  };
  return { challenge, signedMessage: createPolymarketL2CredentialMessage(challenge) };
};

const parsePolymarketL2CredentialMessage = (message: string): PolymarketL2CredentialChallenge => {
  const lines = message.split("\n");
  if (lines[0] !== "Bet Polymarket trading permissions") {
    throw new Error("invalid Polymarket credential challenge prefix");
  }
  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("invalid Polymarket credential challenge format");
    values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }

  const action = values.get("Action");
  const domain = values.get("Domain");
  const userId = values.get("User ID");
  const walletAddress = values.get("Wallet");
  const nonce = values.get("Nonce");
  const issuedAt = values.get("Issued At");
  const expiresAt = values.get("Expires At");
  if (action !== POLYMARKET_L2_SETUP_ACTION || !domain || !userId || !walletAddress || !nonce || !issuedAt || !expiresAt) {
    throw new Error("invalid Polymarket credential challenge fields");
  }
  return {
    action: POLYMARKET_L2_SETUP_ACTION,
    domain: normalizeDomain(domain),
    userId,
    walletAddress: assertValidWalletAddress(walletAddress),
    nonce,
    issuedAt,
    expiresAt,
  };
};

export const verifyPolymarketL2CredentialChallengeSignature = (input: {
  userId: string;
  walletAddress: string;
  domain: string;
  signedMessage: string;
  signature: string;
  now?: Date;
}): PolymarketL2CredentialChallenge => {
  const expectedWalletAddress = assertValidWalletAddress(input.walletAddress);
  const challenge = parsePolymarketL2CredentialMessage(input.signedMessage);
  if (createPolymarketL2CredentialMessage(challenge) !== input.signedMessage) {
    throw new Error("Polymarket credential challenge must be signed exactly");
  }
  if (challenge.userId !== input.userId) throw new Error("Polymarket credential challenge user mismatch");
  if (challenge.walletAddress !== expectedWalletAddress) throw new Error("Polymarket credential challenge wallet mismatch");
  if (challenge.domain !== normalizeDomain(input.domain)) throw new Error("Polymarket credential challenge domain mismatch");
  if (Date.parse(challenge.expiresAt) <= (input.now ?? new Date()).getTime()) {
    throw new Error("Polymarket credential challenge expired");
  }
  if (normalizeWalletAddress(verifyMessage(input.signedMessage, input.signature)) !== expectedWalletAddress) {
    throw new Error("signature does not match wallet address");
  }
  return challenge;
};

const getEncryptionKey = (): Buffer => {
  const raw = process.env.POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) throw new Error("POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY is required to store L2 credentials");
  const key = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  if (key.length !== 32) throw new Error("POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
};

const encryptCredentials = (credentials: PolymarketL2Credentials) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return {
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

const decryptCredentials = (payload: { iv: string; tag: string; ciphertext: string }): PolymarketL2Credentials => {
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as PolymarketL2Credentials;
};

const assertCredentialShape = (credentials: PolymarketL2Credentials): void => {
  if (
    !credentials ||
    typeof credentials.key !== "string" ||
    typeof credentials.secret !== "string" ||
    typeof credentials.passphrase !== "string" ||
    !API_KEY_PATTERN.test(credentials.key.trim()) ||
    !credentials.secret.trim() ||
    !credentials.passphrase.trim()
  ) {
    throw new Error("valid user-owned Polymarket L2 credentials are required");
  }
};

export const storeUserPolymarketL2Credentials = async (input: {
  userId: string;
  walletAddress: string;
  credentials: PolymarketL2Credentials;
  executor?: DatabaseExecutor;
}) => {
  assertCredentialShape(input.credentials);
  const executor = input.executor ?? createDatabaseClient();
  await executor.query(
    `
      insert into public.polymarket_l2_credentials (
        user_id, wallet_address, encrypted_credentials, status, created_at, updated_at, revoked_at
      ) values ($1::uuid, lower($2), $3::jsonb, 'active', now(), now(), null)
      on conflict (user_id)
      do update set wallet_address = excluded.wallet_address,
                    encrypted_credentials = excluded.encrypted_credentials,
                    status = 'active',
                    updated_at = now(),
                    revoked_at = null
    `,
    [input.userId, input.walletAddress, JSON.stringify(encryptCredentials(input.credentials))],
  );
};

export const lookupUserPolymarketL2Credentials = async (
  userId: string,
  walletAddress: string,
  executor: DatabaseExecutor = createDatabaseClient(),
) => {
  const [row] = await executor.query<{ encrypted_credentials: { iv: string; tag: string; ciphertext: string }; status: string }>(
    `
      select encrypted_credentials, status
      from public.polymarket_l2_credentials
      where user_id = $1::uuid
        and lower(wallet_address) = lower($2)
      limit 1
    `,
    [userId, walletAddress],
  );
  if (!row) return { status: "missing" as const };
  if (row.status === "revoked") return { status: "revoked" as const };
  return { status: "present" as const, credentials: decryptCredentials(row.encrypted_credentials) };
};

export const getUserPolymarketL2CredentialStatus = async (
  userId: string,
  executor: DatabaseExecutor = createDatabaseClient(),
): Promise<PolymarketL2CredentialStatusResult> => {
  const [row] = await executor.query<{ wallet_address: string; status: string; updated_at: Date | string }>(
    `
      select wallet_address, status, updated_at
      from public.polymarket_l2_credentials
      where user_id = $1::uuid
      limit 1
    `,
    [userId],
  );

  if (!row) return { status: "missing", walletAddress: null, updatedAt: null };
  return {
    status: row.status === "revoked" ? "revoked" : "present",
    walletAddress: row.wallet_address,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
};

export const revokeUserPolymarketL2Credentials = async (
  userId: string,
  executor: DatabaseExecutor = createDatabaseClient(),
) => {
  await executor.query(
    `update public.polymarket_l2_credentials set status = 'revoked', revoked_at = now(), updated_at = now() where user_id = $1::uuid`,
    [userId],
  );
};
