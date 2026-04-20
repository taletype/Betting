export interface DepositIndexer {
  sync(): Promise<void>;
}
