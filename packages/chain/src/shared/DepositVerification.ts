export interface VerifiedTransfer {
  txHash: string;
  from: string;
  to: string;
  tokenAddress: string;
  amount: bigint;
  blockNumber: bigint;
  success: boolean;
}

export interface VerifyDepositTransferInput {
  txHash: string;
  tokenAddress: string;
  expectedFrom: string;
  expectedTo: string;
  minConfirmations: number;
}

export interface VerifyDepositTransferResult {
  status:
    | 'confirmed'
    | 'wrong_chain'
    | 'pending_confirmations'
    | 'not_found'
    | 'failed'
    | 'wrong_sender'
    | 'wrong_recipient'
    | 'wrong_token'
    | 'no_matching_transfer';
  transfer?: VerifiedTransfer;
  confirmations?: number;
  reason?: string;
}

export interface DepositVerificationAdapter {
  verifyUsdcTransfer(input: VerifyDepositTransferInput): Promise<VerifyDepositTransferResult>;
}
