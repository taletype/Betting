export type VerifiedWallet = {
  id: string;
  chain: string;
  walletAddress: string;
  verifiedAt: string | null;
};

export type WalletsMeResponse = {
  wallets?: VerifiedWallet[];
  wallet?: VerifiedWallet | null;
};

export type WalletVerificationChallengeContext = {
  walletAddress: string;
  message: string;
  challengeId: string;
  nonce?: string;
  issuedAt?: string;
};

export type ChallengeResponse = {
  challenge?: {
    id?: string;
    chain?: string;
    walletAddress?: string;
    nonce?: string;
    issuedAt?: string;
  };
  challengeId?: string;
  signedMessage: string;
};

export type VerifyResponse = {
  wallet?: VerifiedWallet;
};

export type WalletVerificationErrorCode =
  | "wallet_not_connected"
  | "invalid_wallet_address"
  | "wallet_switched"
  | "wallet_sign_unavailable"
  | "user_rejected_signature"
  | "signature_mismatch"
  | "wallet_challenge_expired"
  | "wallet_challenge_used";

export class WalletVerificationFlowError extends Error {
  readonly code: WalletVerificationErrorCode;
  readonly walletAddress: string | null;

  constructor(code: WalletVerificationErrorCode, walletAddress?: string | null) {
    super(code);
    this.code = code;
    this.walletAddress = walletAddress ?? null;
  }
}

export const walletVerificationMessages: Record<WalletVerificationErrorCode, string> = {
  wallet_not_connected: "尚未連接錢包",
  invalid_wallet_address: "錢包地址格式無效",
  wallet_switched: "錢包已切換，請重新驗證目前連接的錢包。",
  wallet_sign_unavailable: "wallet_sign_unavailable：找不到可簽署訊息的錢包。",
  user_rejected_signature: "user_rejected_signature：你已取消錢包簽署。",
  signature_mismatch: "signature_mismatch：簽署錢包與驗證錢包不一致。請使用目前連接的錢包重新簽署。",
  wallet_challenge_expired: "wallet_challenge_expired：驗證請求已過期，請重新驗證。",
  wallet_challenge_used: "wallet_challenge_used：驗證請求已使用，請重新驗證。",
};

export const normalizeEvmAddress = (address: string | null | undefined): string | null => {
  const normalized = address?.trim().toLowerCase();
  return normalized && /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
};

export const hasWalletAddressValue = (address: string | null | undefined): boolean =>
  Boolean(address?.trim());

export const getVerifiedWallet = (payload: WalletsMeResponse): VerifiedWallet | null =>
  payload.wallet ?? payload.wallets?.find((wallet) => wallet.verifiedAt) ?? payload.wallets?.[0] ?? null;

export const shortAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const toWalletVerificationErrorCode = (code: unknown): WalletVerificationErrorCode | null => {
  if (
    code === "wallet_not_connected" ||
    code === "invalid_wallet_address" ||
    code === "wallet_switched" ||
    code === "wallet_sign_unavailable" ||
    code === "user_rejected_signature" ||
    code === "signature_mismatch" ||
    code === "wallet_challenge_expired" ||
    code === "wallet_challenge_used"
  ) return code;
  if (code === "challenge_expired" || code === "WALLET_CHALLENGE_EXPIRED") return "wallet_challenge_expired";
  if (code === "challenge_reused" || code === "WALLET_CHALLENGE_REUSED") return "wallet_challenge_used";
  if (code === "WALLET_SIGNATURE_MISMATCH" || code === "POLYMARKET_WALLET_SIGNATURE_MISMATCH") return "signature_mismatch";
  return null;
};

export const getActiveEvmAddressOrThrow = (address: string | null | undefined): string => {
  if (!hasWalletAddressValue(address)) {
    throw new WalletVerificationFlowError("wallet_not_connected");
  }
  const normalized = normalizeEvmAddress(address);
  if (!normalized) {
    throw new WalletVerificationFlowError("invalid_wallet_address");
  }
  return normalized;
};

export const assertActiveWalletMatchesChallenge = (
  activeAddress: string | null | undefined,
  challengeWalletAddress: string,
): string => {
  const normalized = getActiveEvmAddressOrThrow(activeAddress);
  if (normalized !== challengeWalletAddress) {
    throw new WalletVerificationFlowError("wallet_switched", challengeWalletAddress);
  }
  return normalized;
};

const readChallengeContext = (payload: ChallengeResponse, requestedWalletAddress: string): WalletVerificationChallengeContext => {
  const challengeId = payload.challenge?.id ?? payload.challengeId;
  const challengeWallet = normalizeEvmAddress(payload.challenge?.walletAddress) ?? requestedWalletAddress;
  if (!challengeId || !payload.signedMessage || challengeWallet !== requestedWalletAddress) {
    throw new WalletVerificationFlowError("signature_mismatch", requestedWalletAddress);
  }

  return {
    walletAddress: requestedWalletAddress,
    message: payload.signedMessage,
    challengeId,
    nonce: payload.challenge?.nonce,
    issuedAt: payload.challenge?.issuedAt,
  };
};

export const runWalletVerificationFlow = async (input: {
  chain: string;
  getActiveWalletAddress: () => string | null | undefined;
  requestChallenge: (payload: { walletAddress: string; chain: string }) => Promise<ChallengeResponse>;
  signMessage: (payload: { message: string; walletAddress: string }) => Promise<string>;
  submitVerification: (payload: {
    walletAddress: string;
    chain: string;
    challengeId: string;
    signedMessage: string;
    signature: string;
  }) => Promise<VerifyResponse>;
  onChallenge?: (challenge: WalletVerificationChallengeContext) => void;
  onAbort?: () => void;
}): Promise<VerifyResponse> => {
  const walletAddress = getActiveEvmAddressOrThrow(input.getActiveWalletAddress());
  const challengePayload = await input.requestChallenge({ walletAddress, chain: input.chain });
  const challenge = readChallengeContext(challengePayload, walletAddress);
  input.onChallenge?.(challenge);

  try {
    const signingWalletAddress = assertActiveWalletMatchesChallenge(input.getActiveWalletAddress(), challenge.walletAddress);
    const signature = await input.signMessage({ message: challenge.message, walletAddress: signingWalletAddress });
    const submittingWalletAddress = assertActiveWalletMatchesChallenge(input.getActiveWalletAddress(), challenge.walletAddress);
    return await input.submitVerification({
      walletAddress: submittingWalletAddress,
      chain: input.chain,
      challengeId: challenge.challengeId,
      signedMessage: challenge.message,
      signature,
    });
  } catch (error) {
    if (error instanceof WalletVerificationFlowError && error.code === "wallet_switched") {
      input.onAbort?.();
    }
    throw error;
  }
};
