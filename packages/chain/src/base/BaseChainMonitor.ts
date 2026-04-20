interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

interface HexTransactionReceipt {
  blockNumber: string;
  status: string;
}

export type TxMonitoringState = "pending" | "confirmed" | "failed" | "missing";

export interface TxMonitoringResult {
  state: TxMonitoringState;
  txHash: string;
  confirmations: number;
}

export interface ChainTxMonitor {
  monitorTransaction(input: { txHash: string; minConfirmations: number }): Promise<TxMonitoringResult>;
}

const strip0x = (value: string): string => (value.startsWith("0x") ? value.slice(2) : value);
const normalizeHex = (value: string): string => `0x${strip0x(value).toLowerCase()}`;
const parseHexBigInt = (hex: string): bigint => BigInt(normalizeHex(hex));

const isLocalEnvironment = (): boolean => {
  const env = process.env.NODE_ENV ?? "";
  return env === "" || env === "development" || env === "test" || env === "local";
};

const readBaseRpcUrl = (): string => {
  const value = process.env.BASE_RPC_URL?.trim();
  const candidate = value || (isLocalEnvironment() ? "https://mainnet.base.org" : "");

  if (!candidate) {
    throw new Error("BASE_RPC_URL is required. Set BASE_RPC_URL in your deployment environment.");
  }

  try {
    // eslint-disable-next-line no-new
    new URL(candidate);
  } catch {
    throw new Error(`BASE_RPC_URL must be a valid URL. Received: ${candidate}`);
  }

  return candidate;
};

const readBaseChainId = (): number => {
  const raw = process.env.BASE_CHAIN_ID?.trim() || (isLocalEnvironment() ? "8453" : "");

  if (!raw) {
    throw new Error("BASE_CHAIN_ID is required. Set BASE_CHAIN_ID to 8453 or 84532.");
  }

  const chainId = Number(raw);

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`BASE_CHAIN_ID must be a positive integer. Received: ${raw}`);
  }

  if (chainId !== 8453 && chainId !== 84532) {
    throw new Error(`BASE_CHAIN_ID must be one of: 8453, 84532. Received: ${chainId}`);
  }

  return chainId;
};

export class BaseChainMonitor implements ChainTxMonitor {
  constructor(private readonly rpcUrl: string) {}

  async monitorTransaction(input: { txHash: string; minConfirmations: number }): Promise<TxMonitoringResult> {
    const txHash = normalizeHex(input.txHash);

    const receipt = await this.rpcCall<HexTransactionReceipt | null>("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return { state: "missing", txHash, confirmations: 0 };
    }

    if (receipt.status !== "0x1") {
      return { state: "failed", txHash, confirmations: 0 };
    }

    const [txBlockHex, latestBlockHex] = await Promise.all([
      Promise.resolve(receipt.blockNumber),
      this.rpcCall<string>("eth_blockNumber", []),
    ]);

    const confirmations = Number(parseHexBigInt(latestBlockHex) - parseHexBigInt(txBlockHex) + 1n);

    if (confirmations < input.minConfirmations) {
      return { state: "pending", txHash, confirmations };
    }

    return { state: "confirmed", txHash, confirmations };
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

    if (!response.ok) {
      throw new Error(`base rpc error: ${response.status}`);
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;

    if ("error" in payload) {
      throw new Error(`base rpc error: ${payload.error.message}`);
    }

    return payload.result;
  }
}



export const createBaseChainMonitor = (): BaseChainMonitor => {
  readBaseChainId();
  return new BaseChainMonitor(readBaseRpcUrl());
};
