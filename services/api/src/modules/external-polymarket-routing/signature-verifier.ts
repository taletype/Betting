import { verifyTypedData, type TypedDataDomain } from "viem";
import { logger } from "@bet/observability";

/**
 * Interface representing the structure of a Polymarket V2 Order.
 * Based on @polymarket/clob-client-v2 and the V2 matching engine requirements.
 */
export interface PolymarketV2Order {
  salt: string | number | bigint;
  maker: string;
  signer: string;
  tokenId: string | number | bigint;
  makerAmount: string | number | bigint;
  takerAmount: string | number | bigint;
  expiration: string | number | bigint;
  timestamp: string | number | bigint;
  metadata: string;
  side: number; // 0 for BUY, 1 for SELL
  builder: string;
  signatureType: number;
}

/**
 * EIP-712 Type definitions for Polymarket V2 Orders.
 * Note: V2 removed nonce and feeRateBps, and added timestamp, metadata, and builder.
 */
const POLYMARKET_V2_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "side", type: "uint8" },
    { name: "builder", type: "bytes32" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

/**
 * EIP-712 Domain for Polymarket CLOB V2.
 * Defaults to Polygon Mainnet CTF Exchange values.
 */
const getPolymarketV2Domain = (): TypedDataDomain => ({
  name: process.env.POLYMARKET_CLOB_DOMAIN_NAME || "ClobMarket",
  version: process.env.POLYMARKET_CLOB_DOMAIN_VERSION || "1",
  chainId: Number(process.env.POLYMARKET_CLOB_CHAIN_ID || "137"),
  verifyingContract: (process.env.POLYMARKET_CLOB_EXCHANGE_ADDRESS || "0x4bFb9717c5870b4BA4ca46016393cb2170f1622e") as `0x${string}`,
});

/**
 * Cryptographically verifies a Polymarket user-signed order.
 * 
 * This verifier:
 * 1. Mappings the internal order representation to the EIP-712 Order struct.
 * 2. Uses viem's verifyTypedData to validate the signature against the expected signer.
 * 3. Ensures the builder code signed by the user matches the platform's configured code.
 */
export const verifyPolymarketOrderSignature = async (payload: {
  signedOrder: Record<string, any>;
  expectedSigner: string;
  builderCode: string;
}): Promise<boolean> => {
  const { signedOrder, expectedSigner, builderCode } = payload;

  try {
    const domain = getPolymarketV2Domain();
    
    // Normalize side to numeric representation for EIP-712
    const side = signedOrder.side === "BUY" || signedOrder.side === 0 ? 0 : 1;
    
    // Map internal payload to the canonical Order struct
    const message: PolymarketV2Order = {
      salt: signedOrder.salt || 0,
      maker: signedOrder.maker,
      signer: signedOrder.signer,
      tokenId: signedOrder.tokenId,
      makerAmount: signedOrder.makerAmount,
      takerAmount: signedOrder.takerAmount,
      expiration: signedOrder.expiration || 0,
      timestamp: signedOrder.timestamp,
      metadata: signedOrder.metadata || "0x0000000000000000000000000000000000000000000000000000000000000000",
      side,
      builder: signedOrder.builder,
      signatureType: signedOrder.signatureType || 0,
    };

    // Critical check: The builder code signed by the user MUST match the one we are routing with.
    // This is also checked in handlers.ts but we re-verify here as part of the signature integrity.
    if (signedOrder.builder.toLowerCase() !== builderCode.toLowerCase()) {
      logger.warn("polymarket_signature_verifier.builder_mismatch", {
        signedBuilder: signedOrder.builder,
        expectedBuilder: builderCode,
      });
      return false;
    }

    // Verify the signature using viem
    const isValid = await verifyTypedData({
      address: expectedSigner as `0x${string}`,
      domain,
      types: POLYMARKET_V2_ORDER_TYPES,
      primaryType: "Order",
      message: message as any,
      signature: signedOrder.signature as `0x${string}`,
    });

    if (!isValid) {
      logger.warn("polymarket_signature_verifier.invalid_signature", {
        signer: expectedSigner,
        maker: signedOrder.maker,
      });
    }

    return isValid;
  } catch (error) {
    logger.error("polymarket_signature_verifier.error", {
      error: error instanceof Error ? error.message : String(error),
      signer: expectedSigner,
    });
    return false;
  }
};
