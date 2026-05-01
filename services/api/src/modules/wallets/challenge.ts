import { createHash, randomBytes } from "node:crypto";

import { verifyMessage } from "ethers";

export const WALLET_LINK_ACTION = "link_wallet";
export const WALLET_LINK_CHAIN = "base";
export const WALLET_LINK_TTL_MS = 5 * 60 * 1000;

export interface WalletLinkChallenge {
  id?: string;
  action: typeof WALLET_LINK_ACTION;
  domain: string;
  userId: string;
  walletAddress: string;
  chain: typeof WALLET_LINK_CHAIN;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface WalletLinkChallengeRecord {
  id?: string;
  userId: string;
  walletAddress: string;
  chain: typeof WALLET_LINK_CHAIN;
  domain: string;
  nonceHash: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface WalletLinkChallengeStore {
  insertChallenge(record: WalletLinkChallengeRecord): Promise<{ id: string }>;
  consumeChallenge(input: {
    challengeId?: string;
    userId: string;
    walletAddress: string;
    chain: typeof WALLET_LINK_CHAIN;
    domain: string;
    nonceHash: string;
    now: string;
  }): Promise<WalletLinkChallengeRecord | null>;
}

export type WalletLinkVerificationErrorCode =
  | "invalid_wallet_address"
  | "signature_mismatch"
  | "wallet_challenge_expired"
  | "wallet_challenge_used";

const walletLinkVerificationErrorMessages: Record<WalletLinkVerificationErrorCode, string> = {
  invalid_wallet_address: "錢包地址格式無效。",
  signature_mismatch: "簽署錢包與驗證錢包不一致。請使用目前連接的錢包重新簽署。",
  wallet_challenge_expired: "驗證請求已過期，請重新驗證。",
  wallet_challenge_used: "驗證請求已使用，請重新驗證。",
};

export class WalletLinkVerificationError extends Error {
  readonly code: WalletLinkVerificationErrorCode;
  readonly status: number;

  constructor(code: WalletLinkVerificationErrorCode, status = 400) {
    super(walletLinkVerificationErrorMessages[code]);
    this.code = code;
    this.status = status;
  }
}

export const isWalletLinkVerificationError = (error: unknown): error is WalletLinkVerificationError =>
  error instanceof WalletLinkVerificationError;

export const walletLinkVerificationErrorPayload = (error: WalletLinkVerificationError) => ({
  ok: false,
  error: "wallet verification failed",
  code: error.code,
  message: error.message,
});

export const normalizeWalletAddress = (address: string): string => address.trim().toLowerCase();

export const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

export const assertValidWalletAddress = (address: string): string => {
  const normalized = normalizeWalletAddress(address);
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("wallet address must be a valid 0x EVM address");
  }
  return normalized;
};

export const hashWalletLinkNonce = (nonce: string): string =>
  createHash("sha256").update(nonce, "utf8").digest("hex");

export const createWalletLinkMessage = (challenge: WalletLinkChallenge): string =>
  [
    "Bet wallet link",
    "",
    `Action: ${challenge.action}`,
    `Domain: ${challenge.domain}`,
    `User ID: ${challenge.userId}`,
    `Wallet: ${challenge.walletAddress}`,
    `Chain: ${challenge.chain}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expires At: ${challenge.expiresAt}`,
  ].join("\n");

export const parseWalletLinkMessage = (message: string): WalletLinkChallenge => {
  const lines = message.split("\n");
  if (lines[0] !== "Bet wallet link") {
    throw new Error("invalid wallet link challenge prefix");
  }

  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new Error("invalid wallet link challenge format");
    }
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }

  const challenge = {
    action: values.get("Action")?.trim(),
    domain: values.get("Domain")?.trim(),
    userId: values.get("User ID")?.trim(),
    walletAddress: values.get("Wallet")?.trim(),
    chain: values.get("Chain")?.trim(),
    nonce: values.get("Nonce")?.trim(),
    issuedAt: values.get("Issued At")?.trim(),
    expiresAt: values.get("Expires At")?.trim(),
  };

  if (
    challenge.action !== WALLET_LINK_ACTION ||
    !challenge.domain ||
    !challenge.userId ||
    !challenge.walletAddress ||
    challenge.chain !== WALLET_LINK_CHAIN ||
    !challenge.nonce ||
    !challenge.issuedAt ||
    !challenge.expiresAt
  ) {
    throw new Error("invalid wallet link challenge fields");
  }

  return {
    action: WALLET_LINK_ACTION,
    domain: normalizeDomain(challenge.domain),
    userId: challenge.userId,
    walletAddress: normalizeWalletAddress(challenge.walletAddress),
    chain: WALLET_LINK_CHAIN,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
  };
};

export const createWalletLinkChallenge = async (input: {
  userId: string;
  walletAddress: string;
  chain?: string;
  domain: string;
  store: WalletLinkChallengeStore;
  now?: Date;
  nonceFactory?: () => string;
}): Promise<{ challenge: WalletLinkChallenge; signedMessage: string }> => {
  if (input.chain && input.chain !== WALLET_LINK_CHAIN) {
    throw new Error("unsupported wallet link chain");
  }

  const now = input.now ?? new Date();
  const challenge: WalletLinkChallenge = {
    action: WALLET_LINK_ACTION,
    domain: normalizeDomain(input.domain),
    userId: input.userId,
    walletAddress: assertValidWalletAddress(input.walletAddress),
    chain: WALLET_LINK_CHAIN,
    nonce: input.nonceFactory?.() ?? randomBytes(32).toString("base64url"),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + WALLET_LINK_TTL_MS).toISOString(),
  };

  const inserted = await input.store.insertChallenge({
    userId: challenge.userId,
    walletAddress: challenge.walletAddress,
    chain: challenge.chain,
    domain: challenge.domain,
    nonceHash: hashWalletLinkNonce(challenge.nonce),
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    consumedAt: null,
  });
  challenge.id = inserted.id;

  return { challenge, signedMessage: createWalletLinkMessage(challenge) };
};

export const verifyAndConsumeWalletLinkChallenge = async (input: {
  userId: string;
  walletAddress: string;
  chain?: string;
  challengeId?: string;
  domain: string;
  signedMessage: string;
  signature: string;
  store: WalletLinkChallengeStore;
  now?: Date;
}): Promise<WalletLinkChallenge> => {
  let expectedWalletAddress: string;
  try {
    expectedWalletAddress = assertValidWalletAddress(input.walletAddress);
  } catch {
    throw new WalletLinkVerificationError("invalid_wallet_address");
  }
  const expectedDomain = normalizeDomain(input.domain);
  const expectedChain = input.chain ?? WALLET_LINK_CHAIN;
  if (expectedChain !== WALLET_LINK_CHAIN) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }

  let challenge: WalletLinkChallenge;
  try {
    challenge = parseWalletLinkMessage(input.signedMessage);
  } catch {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (createWalletLinkMessage(challenge) !== input.signedMessage) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (challenge.userId !== input.userId) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (challenge.walletAddress !== expectedWalletAddress) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (challenge.chain !== expectedChain) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (challenge.domain !== expectedDomain) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }

  const now = input.now ?? new Date();
  if (Date.parse(challenge.expiresAt) <= now.getTime()) {
    throw new WalletLinkVerificationError("wallet_challenge_expired");
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = normalizeWalletAddress(verifyMessage(input.signedMessage, input.signature));
  } catch {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (recoveredAddress !== expectedWalletAddress) {
    throw new WalletLinkVerificationError("signature_mismatch");
  }

  const consumed = await input.store.consumeChallenge({
    challengeId: input.challengeId,
    userId: input.userId,
    walletAddress: expectedWalletAddress,
    chain: WALLET_LINK_CHAIN,
    domain: expectedDomain,
    nonceHash: hashWalletLinkNonce(challenge.nonce),
    now: now.toISOString(),
  });
  if (!consumed) {
    throw new WalletLinkVerificationError("wallet_challenge_used", 409);
  }

  return challenge;
};
