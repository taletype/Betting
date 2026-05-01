import assert from "node:assert/strict";
import test from "node:test";

import { Wallet } from "ethers";

import {
  createWalletLinkChallenge,
  createWalletLinkMessage,
  hashWalletLinkNonce,
  WalletLinkVerificationError,
  type WalletLinkChallengeRecord,
  type WalletLinkChallengeStore,
  verifyAndConsumeWalletLinkChallenge,
} from "./challenge";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const domain = "bet.example";
const now = new Date("2026-05-01T00:00:00.000Z");
type TestWallet = ReturnType<typeof Wallet.createRandom>;

const createStore = (): WalletLinkChallengeStore & { records: WalletLinkChallengeRecord[] } => {
  const records: WalletLinkChallengeRecord[] = [];
  return {
    records,
    async insertChallenge(record) {
      const id = `challenge-${records.length + 1}`;
      records.push({ ...record, id });
      return { id };
    },
    async consumeChallenge(input) {
      const record = records.find((candidate) =>
        candidate.id === input.challengeId &&
        candidate.userId === input.userId &&
        candidate.walletAddress === input.walletAddress &&
        candidate.chain === input.chain &&
        candidate.domain === input.domain &&
        candidate.nonceHash === input.nonceHash &&
        candidate.consumedAt === null &&
        Date.parse(candidate.expiresAt) > Date.parse(input.now)
      );
      if (!record) return null;
      record.consumedAt = input.now;
      return record;
    },
  };
};

const makeSignedChallenge = async (overrides: { wallet?: TestWallet; walletAddress?: string; chain?: string; domain?: string; userId?: string; now?: Date } = {}) => {
  const wallet = overrides.wallet ?? Wallet.createRandom();
  const store = createStore();
  const { challenge, signedMessage } = await createWalletLinkChallenge({
    userId: overrides.userId ?? userId,
    walletAddress: overrides.walletAddress ?? wallet.address,
    chain: overrides.chain ?? "base",
    domain: overrides.domain ?? domain,
    store,
    now: overrides.now ?? now,
    nonceFactory: () => "test-nonce",
  });
  return { wallet, store, challenge, signedMessage, signature: await wallet.signMessage(signedMessage) };
};

const assertWalletErrorCode = async (
  fn: () => Promise<unknown>,
  code: WalletLinkVerificationError["code"],
) => {
  await assert.rejects(
    fn,
    (error) => error instanceof WalletLinkVerificationError && error.code === code,
  );
};

test("valid challenge + signature links wallet once", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  const verified = await verifyAndConsumeWalletLinkChallenge({
    userId,
    walletAddress: wallet.address,
    chain: "base",
    domain,
    challengeId: challenge.id,
    signedMessage,
    signature,
    store,
    now,
  });
  assert.equal(verified.walletAddress, wallet.address.toLowerCase());
  assert.equal(store.records[0]?.consumedAt, now.toISOString());
});

test("valid signature succeeds with normalized address casing", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  const submittedWallet = `0X${wallet.address.slice(2).toUpperCase()}`;
  const verified = await verifyAndConsumeWalletLinkChallenge({
    userId,
    walletAddress: submittedWallet,
    chain: "base",
    domain,
    challengeId: challenge.id,
    signedMessage,
    signature,
    store,
    now,
  });

  assert.equal(verified.walletAddress, wallet.address.toLowerCase());
});

test("signature from wallet B for wallet A fails", async () => {
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();
  const { store, challenge, signedMessage } = await makeSignedChallenge({ wallet: walletA });
  const signature = await walletB.signMessage(signedMessage);

  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: walletA.address,
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage,
      signature,
      store,
      now,
    }),
    "signature_mismatch",
  );
});

test("invalid address is rejected with a stable code", async () => {
  const { store, challenge, signedMessage, signature } = await makeSignedChallenge();
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: "0x1234",
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage,
      signature,
      store,
      now,
    }),
    "invalid_wallet_address",
  );
});

test("expired challenge is rejected", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: wallet.address,
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage,
      signature,
      store,
      now: new Date("2026-05-01T00:10:01.000Z"),
    }),
    "wallet_challenge_expired",
  );
});

test("consumed challenge and replayed signature are rejected", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  const input = { userId, walletAddress: wallet.address, chain: "base", domain, challengeId: challenge.id, signedMessage, signature, store, now };
  await verifyAndConsumeWalletLinkChallenge(input);
  await assertWalletErrorCode(() => verifyAndConsumeWalletLinkChallenge(input), "wallet_challenge_used");
});

test("wrong user, wallet, chain, domain, and signed message are rejected", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({ userId: otherUserId, walletAddress: wallet.address, chain: "base", domain, challengeId: challenge.id, signedMessage, signature, store, now }),
    "signature_mismatch",
  );
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({ userId, walletAddress: Wallet.createRandom().address, chain: "base", domain, challengeId: challenge.id, signedMessage, signature, store, now }),
    "signature_mismatch",
  );
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({ userId, walletAddress: wallet.address, chain: "polygon", domain, challengeId: challenge.id, signedMessage, signature, store, now }),
    "signature_mismatch",
  );
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({ userId, walletAddress: wallet.address, chain: "base", domain: "evil.example", challengeId: challenge.id, signedMessage, signature, store, now }),
    "signature_mismatch",
  );
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({ userId, walletAddress: wallet.address, chain: "base", domain, challengeId: challenge.id, signedMessage: `${signedMessage}\nextra`, signature, store, now }),
    "signature_mismatch",
  );
});

test("challenge for wallet A cannot verify wallet B", async () => {
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();
  const { store, challenge, signedMessage, signature } = await makeSignedChallenge({ wallet: walletA });
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: walletB.address,
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage,
      signature,
      store,
      now,
    }),
    "signature_mismatch",
  );
});

test("exact message content is required", async () => {
  const { wallet, store, challenge, signedMessage, signature } = await makeSignedChallenge();
  await assertWalletErrorCode(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: wallet.address,
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage: signedMessage.replace("Action: link_wallet", "Action: link_wallet "),
      signature,
      store,
      now,
    }),
    "signature_mismatch",
  );
});

test("old loose wallet-link messages are rejected", async () => {
  const wallet = Wallet.createRandom();
  const store = createStore();
  for (const signedMessage of [
    "Bet wallet link\nuser:self\nnonce:test",
    `Bet wallet link\nuser:${userId}\nnonce:test`,
  ]) {
    await assertWalletErrorCode(
      () => verifyAndConsumeWalletLinkChallenge({
        userId,
        walletAddress: wallet.address,
        chain: "base",
        domain,
        challengeId: "missing",
        signedMessage,
        signature: "0x00",
        store,
        now,
      }),
      "signature_mismatch",
    );
  }
});

test("signature mismatch errors do not include the full signature", async () => {
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();
  const { store, challenge, signedMessage } = await makeSignedChallenge({ wallet: walletA });
  const signature = await walletB.signMessage(signedMessage);

  await assert.rejects(
    () => verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: walletA.address,
      chain: "base",
      domain,
      challengeId: challenge.id,
      signedMessage,
      signature,
      store,
      now,
    }),
    (error) => error instanceof WalletLinkVerificationError && error.code === "signature_mismatch" && !error.message.includes(signature),
  );
});

test("nonce is stored as a hash", async () => {
  const { store } = await makeSignedChallenge();
  assert.equal(store.records[0]?.nonceHash, hashWalletLinkNonce("test-nonce"));
  assert.notEqual(store.records[0]?.nonceHash, "test-nonce");
});
