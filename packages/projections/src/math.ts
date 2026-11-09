/**
 * High-precision rational arithmetic and HALF_UP rounding for projection engine.
 */

/**
 * Exact HALF_UP integer rounding for rational N / D with D > 0.
 * Ties round away from zero (e.g., 2.5 -> 3, -2.5 -> -3).
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("Denominator must be positive");
  }
  if (numerator >= 0n) {
    return (numerator * 2n + denominator) / (denominator * 2n);
  }
  const positiveNum = -numerator;
  return -((positiveNum * 2n + denominator) / (denominator * 2n));
}

/** Precision scale for rate compounding: 10^18 */
export const SCALE = 1_000_000_000_000_000_000n;

/**
 * Computes monthly factor (1 + rate)^(1/12) scaled by 10^18.
 * For rate = 0, returns SCALE (1.0).
 * For rate = -1, returns 0n.
 */
export function monthlyCompoundingFactor(rateDecimal: string): bigint {
  const r = Number(rateDecimal);
  if (isNaN(r) || r < -1 || r > 1) {
    throw new Error(`Invalid annual rate: ${rateDecimal}`);
  }
  if (r === -1) return 0n;
  if (r === 0) return SCALE;

  // (1 + r)^(1/12)
  const monthlyFactorFloat = Math.pow(1 + r, 1 / 12);
  return BigInt(Math.round(monthlyFactorFloat * 1e18));
}

/**
 * Computes monthly fee retention factor (1 - fee)^(1/12) scaled by 10^18.
 * For fee = 0, returns SCALE (1.0).
 */
export function monthlyFeeRetentionFactor(feeDecimal: string): bigint {
  const f = Number(feeDecimal);
  if (isNaN(f) || f < 0 || f >= 1) {
    throw new Error(`Invalid proportional fee rate: ${feeDecimal}`);
  }
  if (f === 0) return SCALE;

  // (1 - f)^(1/12)
  const factorFloat = Math.pow(1 - f, 1 / 12);
  return BigInt(Math.round(factorFloat * 1e18));
}

/**
 * Computes inflation factor (1 + rate)^(month/12) scaled by 10^18.
 */
export function inflationFactorAtMonth(
  rateDecimal: string,
  month: number,
): bigint {
  const r = Number(rateDecimal);
  if (isNaN(r) || r <= -1 || r > 1) {
    throw new Error(`Invalid inflation rate: ${rateDecimal}`);
  }
  if (r === 0 || month === 0) return SCALE;

  const factorFloat = Math.pow(1 + r, month / 12);
  return BigInt(Math.round(factorFloat * 1e18));
}
