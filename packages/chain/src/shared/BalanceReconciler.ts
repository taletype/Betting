export interface BalanceReconciler {
  reconcile(): Promise<void>;
}
