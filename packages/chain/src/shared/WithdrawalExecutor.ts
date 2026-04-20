export interface WithdrawalExecutor {
  execute(withdrawalId: string): Promise<void>;
}
