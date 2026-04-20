import type {
  DepositVerificationAdapter,
  VerifyDepositTransferInput,
  VerifyDepositTransferResult,
} from "../shared/DepositVerification";

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
  transactionHash: string;
  blockNumber: string;
  status: string;
  logs: {
    address: string;
    topics: string[];
    data: string;
    logIndex: string;
  }[];
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55aeb5f8a5f5";

const strip0x = (value: string): string => value.startsWith("0x") ? value.slice(2) : value;

const normalizeHex = (value: string): string => `0x${strip0x(value).toLowerCase()}`;

const parseHexBigInt = (hex: string): bigint => BigInt(normalizeHex(hex));

const topicToAddress = (topic: string): string => `0x${strip0x(topic).slice(24).toLowerCase()}`;

export class BaseChainAdapter implements DepositVerificationAdapter {
  readonly chain = "base" as const;

  constructor(private readonly rpcUrl: string) {}

  async verifyUsdcTransfer(input: VerifyDepositTransferInput): Promise<VerifyDepositTransferResult> {
    const txHash = normalizeHex(input.txHash);
    const expectedFrom = normalizeHex(input.expectedFrom);
    const expectedTo = normalizeHex(input.expectedTo);
    const expectedToken = normalizeHex(input.tokenAddress);

    const receipt = await this.rpcCall<HexTransactionReceipt | null>("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return { status: "not_found", reason: "transaction receipt not found" };
    }

    if (receipt.status !== "0x1") {
      return { status: "failed", reason: "transaction execution failed" };
    }

    const [blockNumberHex, latestBlockHex] = await Promise.all([
      Promise.resolve(receipt.blockNumber),
      this.rpcCall<string>("eth_blockNumber", []),
    ]);

    const txBlockNumber = parseHexBigInt(blockNumberHex);
    const latestBlock = parseHexBigInt(latestBlockHex);
    const confirmations = Number(latestBlock - txBlockNumber + 1n);

    if (confirmations < input.minConfirmations) {
      return { status: "pending_confirmations", confirmations };
    }

    const transferLogs = receipt.logs.filter(
      (log) => normalizeHex(log.address) === expectedToken && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC,
    );

    if (transferLogs.length === 0) {
      const wrongTokenLog = receipt.logs.find((log) => log.topics[0]?.toLowerCase() === TRANSFER_TOPIC);
      return wrongTokenLog
        ? { status: "wrong_token", reason: "transaction has transfer logs but not for configured token" }
        : { status: "no_matching_transfer", reason: "no transfer log found" };
    }

    for (const log of transferLogs) {
      const from = topicToAddress(log.topics[1] ?? "");
      const to = topicToAddress(log.topics[2] ?? "");

      if (from !== expectedFrom) {
        continue;
      }

      if (to !== expectedTo) {
        return { status: "wrong_recipient", reason: "transfer recipient does not match treasury" };
      }

      return {
        status: "confirmed",
        confirmations,
        transfer: {
          txHash,
          from,
          to,
          tokenAddress: expectedToken,
          amount: parseHexBigInt(log.data),
          blockNumber: txBlockNumber,
          success: true,
        },
      };
    }

    const senderMatchExists = transferLogs.some((log) => topicToAddress(log.topics[1] ?? "") === expectedFrom);
    if (!senderMatchExists) {
      return { status: "wrong_sender", reason: "transfer sender does not match linked wallet" };
    }

    return { status: "wrong_recipient", reason: "transfer recipient does not match treasury" };
  }

  async healthcheck(): Promise<{ ok: boolean }> {
    try {
      await this.rpcCall<string>("eth_chainId", []);
      return { ok: true };
    } catch {
      return { ok: false };
    }
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

export const createBaseChainAdapter = (): BaseChainAdapter =>
  new BaseChainAdapter(process.env.BASE_RPC_URL ?? "https://mainnet.base.org");
