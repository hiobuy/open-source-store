const ZERO = BigInt(0);
const TWO = BigInt(2);
const UNITS_PER_CNY_SCALE = BigInt("100000000");
const MINOR_SCALE = 100;

function normalizeUnits(unitsPerCnyE8: number): bigint {
  if (!Number.isSafeInteger(unitsPerCnyE8) || unitsPerCnyE8 <= 0) {
    throw new Error("Invalid unitsPerCnyE8");
  }
  return BigInt(unitsPerCnyE8);
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint) {
  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / TWO) / denominator;
  return negative ? -rounded : rounded;
}

/**
 * Convert CNY fen to the target currency's minor unit using the integer rate.
 * 1 CNY = unitsPerCnyE8 / 1e8 target units.
 */
export function convertCnyFenToTargetMinor(
  cnyFen: number,
  unitsPerCnyE8: number,
): number {
  if (!Number.isFinite(cnyFen)) throw new Error("Invalid CNY amount");
  const units = normalizeUnits(unitsPerCnyE8);
  const fen = BigInt(Math.round(cnyFen));
  return Number(divideRoundHalfUp(fen * units, UNITS_PER_CNY_SCALE));
}

/**
 * Convert target minor units back to CNY fen. This is an estimate and can
 * differ slightly from settlement due to inverse-rate rounding.
 */
export function convertTargetMinorToCnyFen(
  targetMinor: number,
  unitsPerCnyE8: number,
): number {
  if (!Number.isFinite(targetMinor)) throw new Error("Invalid target amount");
  const units = normalizeUnits(unitsPerCnyE8);
  const minor = BigInt(Math.round(targetMinor));
  return Number(divideRoundHalfUp(minor * UNITS_PER_CNY_SCALE, units));
}

/** Format a minor-unit amount as a decimal string (e.g. 1234 → "12.34"). */
export function formatMinor(minor: number, fractionDigits = 2): string {
  return (minor / MINOR_SCALE).toFixed(fractionDigits);
}
