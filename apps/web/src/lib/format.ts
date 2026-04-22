/**
 * Format utilities for displaying financial data
 */
import { defaultLocale, type AppLocale } from "./locale";

/**
 * Format ticks/atoms as USDC with proper decimal places
 * Assumes 1 USDC = 1,000,000 atoms (6 decimal places)
 */
export const formatUsdc = (
  value: bigint | string | number | null | undefined,
  locale: AppLocale = defaultLocale,
): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  let atoms: bigint;
  if (typeof value === "bigint") {
    atoms = value;
  } else if (typeof value === "number") {
    atoms = BigInt(Math.floor(value));
  } else {
    atoms = BigInt(value);
  }

  // Convert atoms to USDC (6 decimal places)
  const usdc = Number(atoms) / 1_000_000;
  
  // Format with 2 decimal places for display
  return `$${usdc.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Format ticks as decimal price (for display in order book/trades)
 * Assumes tick size is 0.0001 (4 decimal places)
 */
export const formatPrice = (
  value: bigint | string | number | null | undefined,
  locale: AppLocale = defaultLocale,
): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  let ticks: bigint;
  if (typeof value === "bigint") {
    ticks = value;
  } else if (typeof value === "number") {
    ticks = BigInt(Math.floor(value));
  } else {
    ticks = BigInt(value);
  }

  // Convert ticks to price (4 decimal places)
  const price = Number(ticks) / 10_000;
  
  return price.toLocaleString(locale, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
};

/**
 * Format quantity (shares/contracts)
 */
export const formatQuantity = (
  value: bigint | string | number | null | undefined,
  locale: AppLocale = defaultLocale,
): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  let atoms: bigint;
  if (typeof value === "bigint") {
    atoms = value;
  } else if (typeof value === "number") {
    atoms = BigInt(Math.floor(value));
  } else {
    atoms = BigInt(value);
  }

  return atoms.toLocaleString(locale);
};
