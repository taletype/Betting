import { createHash, randomBytes } from "node:crypto";

import { verifyMessage } from "ethers";

export const walletLinkChain = "base";
const walletLinkAction = "link_wallet";
const walletLinkTtlMs = 5 * 60 * 1000;
const polymarketL2Action = "polymarket_l2_credentials";

export interface WalletLinkChallenge {
  id?: string;
  action: typeof walletLinkAction;
  domain: string;
  userId: string;
  walletAddress: string;
  chain: typeof walletLinkChain;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
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

export const walletLinkVerificationErrorPayload = (error: WalletLinkVerificationError) => ({
  ok: false,
  error: "wallet verification failed",
  code: error.code,
  message: error.message,
});

export const normalizeWalletAddress = (value: string): string => value.trim().toLowerCase();
export const normalizeDomain = (value: string): string => value.trim().toLowerCase();

export const assertValidWalletAddress = (value: string): string => {
  const normalized = normalizeWalletAddress(value);
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error("wallet address must be a valid 0x EVM address");
  return normalized;
};

export const hashWalletLinkNonce = (nonce: string): string =>
  createHash("sha256").update(nonce, "utf8").digest("hex");

export const getWalletLinkDomain = (host?: string | null): string =>
  normalizeDomain(process.env.NEXT_PUBLIC_SITE_DOMAIN ?? process.env.SITE_DOMAIN ?? host ?? "localhost");

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
  if (lines[0] !== "Bet wallet link") throw new Error("invalid wallet link challenge prefix");
  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("invalid wallet link challenge format");
    values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  const action = values.get("Action");
  const chain = values.get("Chain");
  const domain = values.get("Domain");
  const userId = values.get("User ID");
  const walletAddress = values.get("Wallet");
  const nonce = values.get("Nonce");
  const issuedAt = values.get("Issued At");
  const expiresAt = values.get("Expires At");
  if (action !== walletLinkAction || chain !== walletLinkChain || !domain || !userId || !walletAddress || !nonce || !issuedAt || !expiresAt) {
    throw new Error("invalid wallet link challenge fields");
  }
  return {
    action: walletLinkAction,
    domain: normalizeDomain(domain),
    userId,
    walletAddress: assertValidWalletAddress(walletAddress),
    chain: walletLinkChain,
    nonce,
    issuedAt,
    expiresAt,
  };
};

export const buildWalletLinkChallenge = (input: {
  userId: string;
  walletAddress: string;
  chain?: string;
  domain: string;
  now?: Date;
}) => {
  if ((input.chain ?? walletLinkChain) !== walletLinkChain) throw new Error("unsupported wallet link chain");
  const now = input.now ?? new Date();
  const challenge: WalletLinkChallenge = {
    action: walletLinkAction,
    domain: normalizeDomain(input.domain),
    userId: input.userId,
    walletAddress: assertValidWalletAddress(input.walletAddress),
    chain: walletLinkChain,
    nonce: randomBytes(32).toString("base64url"),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + walletLinkTtlMs).toISOString(),
  };
  return { challenge, signedMessage: createWalletLinkMessage(challenge), nonceHash: hashWalletLinkNonce(challenge.nonce) };
};

export const assertWalletLinkSignature = (input: {
  userId: string;
  walletAddress: string;
  chain?: string;
  domain: string;
  signedMessage: string;
  signature: string;
}) => {
  if ((input.chain ?? walletLinkChain) !== walletLinkChain) throw new WalletLinkVerificationError("signature_mismatch");
  let expectedWallet: string;
  try {
    expectedWallet = assertValidWalletAddress(input.walletAddress);
  } catch {
    throw new WalletLinkVerificationError("invalid_wallet_address");
  }
  let challenge: WalletLinkChallenge;
  try {
    challenge = parseWalletLinkMessage(input.signedMessage);
  } catch {
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  if (createWalletLinkMessage(challenge) !== input.signedMessage) throw new WalletLinkVerificationError("signature_mismatch");
  if (challenge.userId !== input.userId) throw new WalletLinkVerificationError("signature_mismatch");
  if (challenge.walletAddress !== expectedWallet) throw new WalletLinkVerificationError("signature_mismatch");
  if (challenge.domain !== normalizeDomain(input.domain)) throw new WalletLinkVerificationError("signature_mismatch");
  if (Date.parse(challenge.expiresAt) <= Date.now()) throw new WalletLinkVerificationError("wallet_challenge_expired");
  try {
    if (normalizeWalletAddress(verifyMessage(input.signedMessage, input.signature)) !== expectedWallet) {
      throw new WalletLinkVerificationError("signature_mismatch");
    }
  } catch (error) {
    if (error instanceof WalletLinkVerificationError) throw error;
    throw new WalletLinkVerificationError("signature_mismatch");
  }
  return challenge;
};

export interface PolymarketL2CredentialChallenge {
  action: typeof polymarketL2Action;
  domain: string;
  userId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

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

export const buildPolymarketL2CredentialChallenge = (input: {
  userId: string;
  walletAddress: string;
  domain: string;
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  const challenge: PolymarketL2CredentialChallenge = {
    action: polymarketL2Action,
    domain: normalizeDomain(input.domain),
    userId: input.userId,
    walletAddress: assertValidWalletAddress(input.walletAddress),
    nonce: randomBytes(32).toString("base64url"),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + walletLinkTtlMs).toISOString(),
  };
  return { challenge, signedMessage: createPolymarketL2CredentialMessage(challenge) };
};

const parsePolymarketL2CredentialMessage = (message: string): PolymarketL2CredentialChallenge => {
  const lines = message.split("\n");
  if (lines[0] !== "Bet Polymarket trading permissions") throw new Error("invalid Polymarket credential challenge prefix");
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
  if (action !== polymarketL2Action || !domain || !userId || !walletAddress || !nonce || !issuedAt || !expiresAt) {
    throw new Error("invalid Polymarket credential challenge fields");
  }
  return {
    action: polymarketL2Action,
    domain: normalizeDomain(domain),
    userId,
    walletAddress: assertValidWalletAddress(walletAddress),
    nonce,
    issuedAt,
    expiresAt,
  };
};

export const assertPolymarketL2CredentialSignature = (input: {
  userId: string;
  walletAddress: string;
  domain: string;
  signedMessage: string;
  signature: string;
}) => {
  const expectedWallet = assertValidWalletAddress(input.walletAddress);
  const challenge = parsePolymarketL2CredentialMessage(input.signedMessage);
  if (createPolymarketL2CredentialMessage(challenge) !== input.signedMessage) throw new Error("Polymarket credential challenge must be signed exactly");
  if (challenge.userId !== input.userId) throw new Error("Polymarket credential challenge user mismatch");
  if (challenge.walletAddress !== expectedWallet) throw new Error("Polymarket credential challenge wallet mismatch");
  if (challenge.domain !== normalizeDomain(input.domain)) throw new Error("Polymarket credential challenge domain mismatch");
  if (Date.parse(challenge.expiresAt) <= Date.now()) throw new Error("Polymarket credential challenge expired");
  if (normalizeWalletAddress(verifyMessage(input.signedMessage, input.signature)) !== expectedWallet) {
    throw new Error("signature does not match wallet address");
  }
  return challenge;
};
