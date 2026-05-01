import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountWalletVerificationCard, AccountWalletVerificationCardView } from "./account-wallet-verification-card";
import { runWalletVerificationFlow, WalletVerificationFlowError } from "./wallet-verification-flow";

const walletA = "0x1111111111111111111111111111111111111111";
const walletB = "0x2222222222222222222222222222222222222222";

const challengeFor = (walletAddress: string) => ({
  challenge: { id: "challenge-1", walletAddress, nonce: "nonce-1", issuedAt: "2026-05-01T00:00:00.000Z" },
  signedMessage: `Bet wallet link\nWallet: ${walletAddress}`,
});

test("wallet verification card explains connected wallet is not server verification", () => {
  const markup = renderToStaticMarkup(<AccountWalletVerificationCard />);

  assert.match(markup, /錢包驗證/);
  assert.match(markup, /目前連接錢包/);
  assert.match(markup, /已驗證錢包/);
  assert.match(markup, /瀏覽器錢包連接只代表你可使用該錢包/);
  assert.doesNotMatch(markup, /signature|authorization|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("wallet verification flow uses active wallet for challenge and verify requests", async () => {
  const requestPayloads: unknown[] = [];
  const verifyPayloads: unknown[] = [];
  const savedProfileWallet = walletB;

  await runWalletVerificationFlow({
    chain: "base",
    getActiveWalletAddress: () => walletA,
    requestChallenge: async (payload) => {
      requestPayloads.push({ ...payload, savedProfileWallet });
      return challengeFor(payload.walletAddress);
    },
    signMessage: async () => "0xsigned",
    submitVerification: async (payload) => {
      verifyPayloads.push(payload);
      return { wallet: { id: "1", chain: "base", walletAddress: payload.walletAddress, verifiedAt: "2026-05-01T00:00:00.000Z" } };
    },
  });

  assert.equal((requestPayloads[0] as { walletAddress: string }).walletAddress, walletA);
  assert.equal((verifyPayloads[0] as { walletAddress: string }).walletAddress, walletA);
});

test("saved verified wallet is not treated as the active wallet", () => {
  const markup = renderToStaticMarkup(
    <AccountWalletVerificationCardView
      activeWalletPresent
      connectedAddress={walletA}
      verifiedAddress={walletB}
      loading={false}
      verifying={false}
      notice={null}
      error={null}
    />,
  );

  assert.match(markup, /0x1111\.\.\.1111/);
  assert.match(markup, /0x2222\.\.\.2222/);
  assert.match(markup, /目前錢包與已驗證錢包不同，請重新驗證/);
  assert.match(markup, /驗證此 EVM 錢包/);
});

test("wallet switch after challenge aborts before signing", async () => {
  let activeWallet = walletA;
  let signCalled = false;

  await assert.rejects(
    () => runWalletVerificationFlow({
      chain: "base",
      getActiveWalletAddress: () => activeWallet,
      requestChallenge: async (payload) => {
        activeWallet = walletB;
        return challengeFor(payload.walletAddress);
      },
      signMessage: async () => {
        signCalled = true;
        return "0xsigned";
      },
      submitVerification: async () => ({}),
    }),
    (error) => error instanceof WalletVerificationFlowError && error.code === "wallet_switched",
  );

  assert.equal(signCalled, false);
});

test("wallet switch after signing blocks submit", async () => {
  let activeWallet = walletA;
  let submitCalled = false;

  await assert.rejects(
    () => runWalletVerificationFlow({
      chain: "base",
      getActiveWalletAddress: () => activeWallet,
      requestChallenge: async (payload) => challengeFor(payload.walletAddress),
      signMessage: async () => {
        activeWallet = walletB;
        return "0xsigned";
      },
      submitVerification: async () => {
        submitCalled = true;
        return {};
      },
    }),
    (error) => error instanceof WalletVerificationFlowError && error.code === "wallet_switched",
  );

  assert.equal(submitCalled, false);
});

test("signature mismatch message renders with current-wallet instruction", () => {
  const markup = renderToStaticMarkup(
    <AccountWalletVerificationCardView
      activeWalletPresent
      connectedAddress={walletA}
      verifiedAddress={null}
      loading={false}
      verifying={false}
      notice={null}
      error="signature_mismatch：簽署錢包與驗證錢包不一致。請使用目前連接的錢包重新簽署。"
    />,
  );

  assert.match(markup, /簽署錢包與驗證錢包不一致。請使用目前連接的錢包重新簽署。/);
});

test("verified status only appears when active wallet equals verified wallet", () => {
  const verifiedMarkup = renderToStaticMarkup(
    <AccountWalletVerificationCardView
      activeWalletPresent
      connectedAddress={walletA}
      verifiedAddress={walletA}
      loading={false}
      verifying={false}
      notice={null}
      error={null}
    />,
  );
  const mismatchMarkup = renderToStaticMarkup(
    <AccountWalletVerificationCardView
      activeWalletPresent
      connectedAddress={walletB}
      verifiedAddress={walletA}
      loading={false}
      verifying={false}
      notice={null}
      error={null}
    />,
  );

  assert.match(verifiedMarkup, /已驗證/);
  assert.match(mismatchMarkup, /目前錢包與已驗證錢包不同，請重新驗證/);
});

test("no wallet and invalid wallet states are explicit", async () => {
  const markup = renderToStaticMarkup(
    <AccountWalletVerificationCardView
      activeWalletPresent={false}
      connectedAddress={null}
      verifiedAddress={null}
      loading={false}
      verifying={false}
      notice={null}
      error={null}
    />,
  );

  assert.match(markup, /尚未連接錢包/);
  await assert.rejects(
    () => runWalletVerificationFlow({
      chain: "base",
      getActiveWalletAddress: () => "0x1234",
      requestChallenge: async () => challengeFor(walletA),
      signMessage: async () => "0xsigned",
      submitVerification: async () => ({}),
    }),
    (error) => error instanceof WalletVerificationFlowError && error.code === "invalid_wallet_address",
  );
});
