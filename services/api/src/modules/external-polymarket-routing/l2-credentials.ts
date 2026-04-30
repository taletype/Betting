import crypto from "node:crypto";

import { createDatabaseClient, type DatabaseExecutor } from "@bet/db";

import type { PolymarketL2Credentials } from "./submitter";

const ALGORITHM = "aes-256-gcm";
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{8,}$/;

export type PolymarketL2CredentialPublicStatus = "present" | "missing" | "revoked";

export interface PolymarketL2CredentialStatusResult {
  status: PolymarketL2CredentialPublicStatus;
  walletAddress: string | null;
  updatedAt: string | null;
}

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
