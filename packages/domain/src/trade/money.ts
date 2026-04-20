import { invariant } from "../errors/invariant";

export type Money = bigint;
export type Shares = bigint;
export type MoneyAtoms = bigint;
export type PriceTicks = bigint;
export type QuantityAtoms = bigint;
export type ReservedAmountAtoms = bigint;

export const money = (value: bigint | number | string): Money => BigInt(value);
export const shares = (value: bigint | number | string): Shares => BigInt(value);
export const moneyAtoms = (value: bigint | number | string): MoneyAtoms => BigInt(value);
export const priceTicks = (value: bigint | number | string): PriceTicks => BigInt(value);
export const quantityAtoms = (value: bigint | number | string): QuantityAtoms => BigInt(value);
export const reservedAmountAtoms = (value: bigint | number | string): ReservedAmountAtoms =>
  BigInt(value);

export const addMoney = (...values: Money[]): Money =>
  values.reduce((total, value) => total + value, 0n);

export const subtractMoney = (left: Money, right: Money): Money => left - right;
export const multiplyMoney = (price: Money, quantity: Shares): Money => price * quantity;
export const multiplyPriceTicks = (price: PriceTicks, quantity: QuantityAtoms): MoneyAtoms =>
  price * quantity;

export const assertNonNegative = (value: bigint, label: string): void => {
  if (value < 0n) {
    throw new Error(`${label} must be non-negative`);
  }
};

export const assertPositive = (value: bigint, label: string): void => {
  invariant(value > 0n, `${label} must be positive`);
};
